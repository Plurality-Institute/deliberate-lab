import {onCall} from 'firebase-functions/v2/https';
import * as functions from 'firebase-functions';
import {app} from './app';
import * as admin from 'firebase-admin';
import {AuthGuard} from './utils/auth-guard';
import archiver from 'archiver';
import {PassThrough} from 'stream';
import {v4 as uuidv4} from 'uuid';

import {
  AgentChatPromptConfig,
  AgentDataObject,
  AgentParticipantPromptConfig,
  AgentPersonaConfig,
  BehaviorEvent,
  ChatMessage,
  CohortConfig,
  Experiment,
  ExperimentDownload,
  StageConfig,
  StageKind,
  StageParticipantAnswer,
  StagePublicData,
  createCohortDownload,
  createExperimentDownload,
  createParticipantDownload,
  ParticipantProfileExtended,
} from '@deliberation-lab/utils';

// Concurrency-limited async map helper
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const runner = async () => {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) break;
      results[i] = await worker(items[i], i);
    }
  };

  const runners = Array.from({length: Math.min(limit, items.length)}, () =>
    runner(),
  );
  await Promise.all(runners);
  return results;
}

/**
 * Generate an ExperimentDownload payload server-side to avoid client roundtrips.
 * Input: { experimentId: string }
 * Auth: experimenter only
 */
export const generateExperimentDownload = onCall(
  {timeoutSeconds: 900, memory: '4GiB'},
  async (request) => {
    await AuthGuard.isExperimenter(request);
    const {data} = request as {data: {experimentId?: string}};
    const experimentId = data?.experimentId;
    if (!experimentId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'experimentId is required',
      );
    }

    const db = app.firestore();

    // Fetch core collections in parallel (page large ones later)
    const [expSnap, stagesSnap, agentsSnap] = await Promise.all([
      db.collection('experiments').doc(experimentId).get(),
      db.collection('experiments').doc(experimentId).collection('stages').get(),
      db.collection('experiments').doc(experimentId).collection('agents').get(),
    ]);

    if (!expSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Experiment not found');
    }

    const experiment = expSnap.data() as Experiment;
    const baseOut: ExperimentDownload = createExperimentDownload(experiment);

    // Prepare Cloud Storage streaming write
    const projectId =
      process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Missing project id in environment',
      );
    }

    const bucketName =
      process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
    const bucket = app.storage().bucket(bucketName);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const friendlyJsonName = `experiment-${experimentId}-${timestamp}.json`;
    const zipFileName = `experiment-${experimentId}-${timestamp}.zip`;
    const path = `downloads/experiments/${experimentId}/${timestamp}-${uuidv4()}.zip`;
    const file = bucket.file(path);
    const writeStream = file.createWriteStream({
      resumable: false,
      metadata: {
        contentType: 'application/zip',
        cacheControl: 'no-cache',
        contentDisposition: `attachment; filename="${zipFileName}"`,
      },
    });

    // Setup archiver to build a zip and count bytes written
    const archive = archiver('zip', {zlib: {level: 9}});
    const zipOutput = new PassThrough();
    let bytesWritten = 0;
    zipOutput.on('data', (chunk) => {
      bytesWritten += Buffer.isBuffer(chunk)
        ? chunk.length
        : Buffer.byteLength(String(chunk));
    });
    zipOutput.on('error', (e) => writeStream.destroy(e));
    archive.on('warning', (e: Error) =>
      functions.logger.warn('archiver warning', e),
    );
    archive.on('error', (e: Error) => writeStream.destroy(e));
    zipOutput.pipe(writeStream);
    archive.pipe(zipOutput);

    // Create a streaming entry for the JSON inside the zip
    const jsonEntry = new PassThrough();
    archive.append(jsonEntry, {name: friendlyJsonName});

    const write = (chunk: string) => {
      const buf = Buffer.from(chunk, 'utf8');
      jsonEntry.write(buf);
    };

    // Helper to page through a collection by document ID
    const pageThrough = async (
      col: FirebaseFirestore.CollectionReference,
      pageSize: number,
      handler: (
        docs: FirebaseFirestore.QueryDocumentSnapshot[],
      ) => Promise<void>,
    ) => {
      let lastId: string | undefined;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let q = col
          .orderBy(admin.firestore.FieldPath.documentId())
          .limit(pageSize);
        if (lastId) q = q.startAfter(lastId);
        const snap = await q.get();
        if (snap.empty) break;
        await handler(snap.docs);
        lastId = snap.docs[snap.docs.length - 1].id;
        if (snap.size < pageSize) break;
      }
    };

    // Start JSON document
    write('{');
    // experiment field
    write('"experiment":');
    write(JSON.stringify(baseOut.experiment));

    // stageMap field
    write(',"stageMap":{');
    let stageFirst = true;
    for (const d of stagesSnap.docs) {
      const stage = d.data() as StageConfig;
      write(stageFirst ? '' : ',');
      stageFirst = false;
      write(JSON.stringify(stage.id));
      write(':');
      write(JSON.stringify(stage));
    }
    write('}');

    // agentMap field (concurrency-limited)
    write(',"agentMap":{');
    let agentFirst = true;
    let agentWriteChain = Promise.resolve();
    const personas = agentsSnap.docs.map((d) => d.data() as AgentPersonaConfig);
    await mapWithConcurrency(personas, 20, async (persona) => {
      const [participantPromptsSnap, chatPromptsSnap] = await Promise.all([
        db
          .collection('experiments')
          .doc(experimentId)
          .collection('agents')
          .doc(persona.id)
          .collection('participantPrompts')
          .get(),
        db
          .collection('experiments')
          .doc(experimentId)
          .collection('agents')
          .doc(persona.id)
          .collection('chatPrompts')
          .get(),
      ]);

      const agentObject: AgentDataObject = {
        persona,
        participantPromptMap: {},
        chatPromptMap: {},
      };
      participantPromptsSnap.docs
        .map((d) => d.data() as AgentParticipantPromptConfig)
        .forEach((p) => (agentObject.participantPromptMap[p.id] = p));
      chatPromptsSnap.docs
        .map((d) => d.data() as AgentChatPromptConfig)
        .forEach((p) => (agentObject.chatPromptMap[p.id] = p));

      const entry = `${agentFirst ? '' : ','}${JSON.stringify(
        persona.id,
      )}:${JSON.stringify(agentObject)}`;
      agentFirst = false;
      agentWriteChain = agentWriteChain.then(() => {
        write(entry);
      });
      await agentWriteChain;
    });
    await agentWriteChain;
    write('}');

    // cohortMap field (paged + concurrency-limited)
    write(',"cohortMap":{');
    let cohortFirst = true;
    let cohortWriteChain = Promise.resolve();
    const cohortsCol = db
      .collection('experiments')
      .doc(experimentId)
      .collection('cohorts');
    await pageThrough(cohortsCol, 200, async (docs) => {
      const cohorts = docs.map((d) => d.data() as CohortConfig);
      await mapWithConcurrency(cohorts, 20, async (cohort) => {
        const cohortDownload = createCohortDownload(cohort);
        const publicStageSnap = await db
          .collection('experiments')
          .doc(experimentId)
          .collection('cohorts')
          .doc(cohort.id)
          .collection('publicStageData')
          .get();

        const publicStageData = publicStageSnap.docs.map(
          (d) => d.data() as StagePublicData,
        );
        publicStageData.forEach(
          (data) => (cohortDownload.dataMap[data.id] = data),
        );

        const chatStageIds = publicStageData
          .filter((d) => d.kind === StageKind.CHAT)
          .map((d) => d.id);
        if (chatStageIds.length > 0) {
          const chatSnaps = await Promise.all(
            chatStageIds.map((stageId) =>
              db
                .collection('experiments')
                .doc(experimentId)
                .collection('cohorts')
                .doc(cohort.id)
                .collection('publicStageData')
                .doc(stageId)
                .collection('chats')
                .orderBy('timestamp', 'asc')
                .get(),
            ),
          );
          chatSnaps.forEach((snap, idx) => {
            const stageId = chatStageIds[idx];
            cohortDownload.chatMap[stageId] = snap.docs.map(
              (d) => d.data() as ChatMessage,
            );
          });
        }

        const entry = `${cohortFirst ? '' : ','}${JSON.stringify(
          cohort.id,
        )}:${JSON.stringify(cohortDownload)}`;
        cohortFirst = false;
        cohortWriteChain = cohortWriteChain.then(() => {
          write(entry);
        });
        await cohortWriteChain;
      });
    });
    await cohortWriteChain;
    write('}');

    // participantMap field (paged + concurrency-limited)
    write(',"participantMap":{');
    let participantFirst = true;
    let participantWriteChain = Promise.resolve();
    const participantsCol = db
      .collection('experiments')
      .doc(experimentId)
      .collection('participants');
    await pageThrough(participantsCol, 200, async (docs) => {
      const profiles = docs.map((d) => d.data() as ParticipantProfileExtended);
      await mapWithConcurrency(profiles, 20, async (profile) => {
        const participant = createParticipantDownload(profile);
        const [answersSnap, behaviorSnap] = await Promise.all([
          db
            .collection('experiments')
            .doc(experimentId)
            .collection('participants')
            .doc(profile.privateId)
            .collection('stageData')
            .get(),
          db
            .collection('experiments')
            .doc(experimentId)
            .collection('participants')
            .doc(profile.privateId)
            .collection('behavior')
            .orderBy('timestamp', 'asc')
            .get(),
        ]);

        answersSnap.docs
          .map((d) => d.data() as StageParticipantAnswer)
          .forEach((ans) => (participant.answerMap[ans.id] = ans));
        participant.behavior = behaviorSnap.docs.map(
          (d) => d.data() as BehaviorEvent,
        );

        const entry = `${participantFirst ? '' : ','}${JSON.stringify(
          profile.publicId,
        )}:${JSON.stringify(participant)}`;
        participantFirst = false;
        participantWriteChain = participantWriteChain.then(() => {
          write(entry);
        });
        await participantWriteChain;
      });
    });
    await participantWriteChain;
    write('}');

    // End JSON document and finalize archive stream
    write('}');
    const finished = new Promise<void>((resolve, reject) => {
      writeStream.on('finish', () => resolve());
      writeStream.on('error', (e) => reject(e));
    });
    jsonEntry.end();
    // Finalize zip (no more entries)
    archive.finalize();
    await finished;

    const size = bytesWritten;

    // 15 minutes expiry
    const expiresAt = Date.now() + 15 * 60 * 1000;
    // Generate signed URL (unsupported on Storage emulator)
    if (process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
      functions.logger.warn(
        'Storage emulator detected; signed URLs are not supported.',
      );
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Signed URLs are not supported when using the Storage emulator.',
      );
    }

    try {
      const [url] = await file.getSignedUrl({
        action: 'read',
        version: 'v4',
        expires: new Date(expiresAt),
      });
      return {url, expiresAt, path, size, contentType: 'application/zip'};
    } catch (err: unknown) {
      functions.logger.error('Failed to generate signed URL', err);
      const hint =
        'Ensure the Cloud Functions runtime service account has the "Service Account Token Creator" role and that local runs use a service account key (GOOGLE_APPLICATION_CREDENTIALS).';
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Unable to generate signed URL. ${hint}`,
      );
    }
  },
);
