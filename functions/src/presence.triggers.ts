import * as admin from 'firebase-admin';

import {database} from 'firebase-functions/v2';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {app} from './app';

const dbInstance = `${process.env.GCLOUD_PROJECT}-default-rtdb`;

/**
 * Mirror presence from RTDB → Firestore and maintain an aggregate node. Use
 * separate connection IDs to track individual connections, to properly support
 * multiple browser tabs or devices.
 *
 * RTDB write path:
 *   /status/{experimentId}/{participantPrivateId}/{connectionId}
 *
 * Firestore doc path:
 *   experiments/{experimentId}/participants/{participantPrivateId}
 */
export const mirrorPresenceToFirestore = database.onValueWritten(
  {
    instance: dbInstance,
    ref: '/status/{experimentId}/{participantPrivateId}/{connectionId}',
    region: 'us-central1',
    timeoutSeconds: 60,
  },
  async (event) => {
    const {experimentId, participantPrivateId, connectionId} = event.params;

    if (connectionId.startsWith('_')) return null;

    const parentRef = event.data.after.ref.parent; // participantPrivateId
    const aggRef = parentRef!.child('_aggregate');
    const fsRef = app
      .firestore()
      .doc(`experiments/${experimentId}/participants/${participantPrivateId}`);

    const siblingsSnapshot = await parentRef!.once('value');
    const siblings = siblingsSnapshot.val();

    let online = false;
    for (const key in siblings) {
      if (key.startsWith('_')) {
        // ignore _aggregate, future meta-nodes
        continue;
      }

      if (siblings[key].connected) {
        online = true;
        break;
      }
    }

    await aggRef.set({
      state: online ? 'online' : 'offline',
      ts: admin.database.ServerValue.TIMESTAMP,
    });

    const snapshot = await fsRef.get();
    if (!snapshot.exists) {
      console.warn(
        `No participant ${participantPrivateId} in experiment ${experimentId}`,
      );
      return null;
    }
    if (snapshot.data()?.agentConfig) {
      // Skip bot/agent participants
      return null;
    }

    return fsRef.set(
      {
        connected: online,
        last_changed: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  },
);

export const scrubStalePresence = onSchedule(
  {
    schedule: 'every 24 hours',
    region: 'us-central1',
    timeoutSeconds: 300,
  },
  async () => {
    const cutoff = Date.now() - 72 * 60 * 60 * 1000; // 72 hours
    // Explicitly use the same RTDB instance as the trigger
    const dbUrl = `https://${dbInstance}.firebaseio.com`;
    const root = admin.app().database(dbUrl).ref('status');
    const usersSnapshot = await root.get();
    const userSnapshots: admin.database.DataSnapshot[] = [];
    for (const userSnapshot of Object.values(usersSnapshot.val() || {})) {
      userSnapshots.push(userSnapshot as admin.database.DataSnapshot);
    }
    for (const userSnapshot of userSnapshots) {
      const connSnapshots: admin.database.DataSnapshot[] = [];
      userSnapshot.forEach((connSnapshot) => {
        connSnapshots.push(connSnapshot);
      });

      // Find the most recent connection (excluding meta nodes)
      let mostRecentTs = -Infinity;
      let mostRecentKey: string | null = null;
      for (const connSnapshot of connSnapshots) {
        if (!connSnapshot.key!.startsWith('_')) {
          const ts = connSnapshot.child('ts').val();
          if (typeof ts === 'number' && ts > mostRecentTs) {
            mostRecentTs = ts;
            mostRecentKey = connSnapshot.key!;
          }
        }
      }

      // Remove all stale connections except the most recent one
      for (const connSnapshot of connSnapshots) {
        if (
          !connSnapshot.key!.startsWith('_') &&
          connSnapshot.key !== mostRecentKey &&
          connSnapshot.child('ts').val() < cutoff
        ) {
          connSnapshot.ref.remove();
        }
      }
    }
  },
);
