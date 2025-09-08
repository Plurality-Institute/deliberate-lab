import {onCall} from 'firebase-functions/v2/https';
import * as functions from 'firebase-functions';
import {app} from './app';
import {AuthGuard} from './utils/auth-guard';
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
  {timeoutSeconds: 900, memory: '2GiB'},
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

    // Fetch core collections in parallel
    const [expSnap, stagesSnap, participantsSnap, agentsSnap, cohortsSnap] =
      await Promise.all([
        db.collection('experiments').doc(experimentId).get(),
        db
          .collection('experiments')
          .doc(experimentId)
          .collection('stages')
          .get(),
        db
          .collection('experiments')
          .doc(experimentId)
          .collection('participants')
          .get(),
        db
          .collection('experiments')
          .doc(experimentId)
          .collection('agents')
          .get(),
        db
          .collection('experiments')
          .doc(experimentId)
          .collection('cohorts')
          .get(),
      ]);

    if (!expSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Experiment not found');
    }

    const experiment = expSnap.data() as Experiment;
    const out: ExperimentDownload = createExperimentDownload(experiment);

    // Stages
    stagesSnap.docs
      .map((d) => d.data() as StageConfig)
      .forEach((stage) => (out.stageMap[stage.id] = stage));

    // Participants with answers and behavior
    const profiles = participantsSnap.docs.map(
      (d) => d.data() as ParticipantProfileExtended,
    );
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

      out.participantMap[profile.publicId] = participant;
    });

    // Agents with prompts
    const personas = agentsSnap.docs.map((d) => d.data() as AgentPersonaConfig);
    await Promise.all(
      personas.map(async (persona) => {
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

        out.agentMap[persona.id] = agentObject;
      }),
    );

    // Cohorts: public stage data and chats
    const cohorts = cohortsSnap.docs.map((d) => d.data() as CohortConfig);
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

      out.cohortMap[cohort.id] = cohortDownload;
    });

    // Serialize and upload JSON to Cloud Storage, then return a signed URL
    const json = JSON.stringify(out);
    const size = Buffer.byteLength(json, 'utf8');

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
    const friendlyName = `experiment-${experimentId}-${timestamp}.json`;
    const path = `downloads/experiments/${experimentId}/${timestamp}-${uuidv4()}.json`;

    const file = bucket.file(path);
    await file.save(Buffer.from(json, 'utf8'), {
      contentType: 'application/json; charset=utf-8',
      resumable: false,
      metadata: {
        cacheControl: 'no-cache',
        contentDisposition: `attachment; filename="${friendlyName}"`,
      },
    });

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
      return {url, expiresAt, path, size, contentType: 'application/json'};
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
