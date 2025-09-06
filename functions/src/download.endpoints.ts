import {onCall} from 'firebase-functions/v2/https';
import * as functions from 'firebase-functions';
import {app} from './app';
import {AuthGuard} from './utils/auth-guard';

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

/**
 * Generate an ExperimentDownload payload server-side to avoid client roundtrips.
 * Input: { experimentId: string }
 * Auth: experimenter only
 */
export const generateExperimentDownload = onCall(
  {timeoutSeconds: 600},
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
    await Promise.all(
      profiles.map(async (profile) => {
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
      }),
    );

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
    await Promise.all(
      cohorts.map(async (cohort) => {
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
      }),
    );

    return out;
  },
);
