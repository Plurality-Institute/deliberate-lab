import {Timestamp} from 'firebase-admin/firestore';
import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} from 'firebase-functions/v2/firestore';
import {
  ChatStageParticipantAnswer,
  StageKind,
  createAgentChatPromptConfig,
  createChatStageParticipantAnswer,
  createMediatorChatMessage,
  createParticipantChatMessage,
  getTimeElapsed,
  DEFAULT_AGENT_PARTICIPANT_CHAT_PROMPT,
  ChatStagePublicData,
  ParticipantProfileExtended,
  StageConfig,
  Experiment,
} from '@deliberation-lab/utils';
import {updateCurrentDiscussionIndex} from './chat.utils';
import {getPastStagesPromptContext} from './stage.utils';
import {getMediatorsInCohortStage} from '../mediator.utils';
import {updateParticipantNextStage} from '../participant.utils';
import {
  getFirestoreActiveParticipants,
  getFirestoreParticipant,
  getFirestoreParticipantRef,
  getFirestoreParticipantAnswer,
  getFirestoreParticipantAnswerRef,
} from '../utils/firestore';
import {
  getAgentChatAPIResponse,
  getAgentChatPrompt,
  getChatMessages,
  getChatStage,
  getChatStagePublicData,
  hasEndedChat,
  sendAgentChatMessage,
} from './chat.utils';

import {app} from '../app';
import {AgentPersonaType} from '@deliberation-lab/utils';

// ************************************************************************* //
// TRIGGER FUNCTIONS                                                         //
// ************************************************************************* //

/** When a chat message is created, start tracking elapsed time. */
export const startTimeElapsed = onDocumentCreated(
  'experiments/{experimentId}/cohorts/{cohortId}/publicStageData/{stageId}/chats/{chatId}',
  async (event) => {
    const stage = await getChatStage(
      event.params.experimentId,
      event.params.stageId,
    );
    if (!stage) return;

    const publicStageData = await getChatStagePublicData(
      event.params.experimentId,
      event.params.cohortId,
      event.params.stageId,
    );
    if (!publicStageData) return;

    // Exit if discussion has already ended.
    if (publicStageData.discussionEndTimestamp) return;

    // Update the start timestamp and checkpoint timestamp if not set.
    if (publicStageData.discussionStartTimestamp === null) {
      await app
        .firestore()
        .doc(
          `experiments/${event.params.experimentId}/cohorts/${event.params.cohortId}/publicStageData/${event.params.stageId}`,
        )
        .update({
          discussionStartTimestamp: Timestamp.now(),
          discussionCheckpointTimestamp: Timestamp.now(),
        });
    }
  },
);

/**
 * When chat public stage data is updated, update elapsed time
 * and potentially end the discussion.
 */
export const updateTimeElapsed = onDocumentUpdated(
  {
    document:
      'experiments/{experimentId}/cohorts/{cohortId}/publicStageData/{stageId}/',
    timeoutSeconds: 360, // Maximum timeout of 6 minutes.
  },
  async (event) => {
    const publicStageData = await getChatStagePublicData(
      event.params.experimentId,
      event.params.cohortId,
      event.params.stageId,
    );
    if (!publicStageData) return;

    // Only update time if the conversation is in progress.
    if (
      !publicStageData.discussionStartTimestamp ||
      publicStageData.discussionEndTimestamp
    )
      return;

    const stage = await getChatStage(
      event.params.experimentId,
      event.params.stageId,
    );
    if (!stage || !stage.timeLimitInMinutes) return;
    // Maybe end the chat.
    if (
      await hasEndedChat(
        event.params.experimentId,
        event.params.cohortId,
        event.params.stageId,
        stage,
        publicStageData,
      )
    )
      return;

    // Calculate how long to wait.
    const elapsedMinutes = getTimeElapsed(
      publicStageData.discussionStartTimestamp,
      'm',
    );
    const maxWaitTimeInMinutes = 5;
    const remainingTime = stage.timeLimitInMinutes - elapsedMinutes;
    const intervalTime = Math.min(maxWaitTimeInMinutes, remainingTime);

    // Wait for the determined interval time, and then re-trigger the function.
    await new Promise((resolve) =>
      setTimeout(resolve, intervalTime * 60 * 1000),
    );
    await app
      .firestore()
      .doc(
        `experiments/${event.params.experimentId}/cohorts/${event.params.cohortId}/publicStageData/${event.params.stageId}`,
      )
      .update({discussionCheckpointTimestamp: Timestamp.now()});
  },
);

/** When chat participant answer is updated, check if all participants
 * are ready to move to next discussion. */
export const updateCurrentChatDiscussionId = onDocumentWritten(
  {
    document:
      'experiments/{experimentId}/participants/{participantId}/stageData/{stageId}',
    timeoutSeconds: 60,
  },
  async (event) => {
    const data = event.data!.after.data() as ChatStageParticipantAnswer;

    const stageDocument = app
      .firestore()
      .collection('experiments')
      .doc(event.params.experimentId)
      .collection('stages')
      .doc(event.params.stageId);
    const stage = (await stageDocument.get()).data() as StageConfig;
    if (stage.kind !== StageKind.CHAT) return;

    // Define participant document
    const participantDocument = app
      .firestore()
      .collection('experiments')
      .doc(event.params.experimentId)
      .collection('participants')
      .doc(event.params.participantId);

    const participant = (
      await participantDocument.get()
    ).data() as ParticipantProfileExtended;

    // Define public stage document reference
    const publicDocument = app
      .firestore()
      .collection('experiments')
      .doc(event.params.experimentId)
      .collection('cohorts')
      .doc(participant.currentCohortId)
      .collection('publicStageData')
      .doc(event.params.stageId);

    await app.firestore().runTransaction(async (transaction) => {
      // Update public stage data
      const publicStageData = (
        await publicDocument.get()
      ).data() as ChatStagePublicData;
      const discussionStatusMap = data.discussionTimestampMap;

      for (const discussionId of Object.keys(discussionStatusMap)) {
        if (!publicStageData.discussionTimestampMap[discussionId]) {
          publicStageData.discussionTimestampMap[discussionId] = {};
        }
        publicStageData.discussionTimestampMap[discussionId][
          participant.publicId
        ] = discussionStatusMap[discussionId];
      }

      // Update current discussion ID if applicable
      await updateCurrentDiscussionIndex(
        event.params.experimentId,
        participant.currentCohortId,
        event.params.stageId,
        publicStageData,
      );

      transaction.set(publicDocument, publicStageData);
    });
  },
);

/** When chat message is created, generate mediator agent response if relevant. */
// TODO: Rename to createAgentMediatorMessage
export const createAgentMessage = onDocumentCreated(
  {
    document:
      'experiments/{experimentId}/cohorts/{cohortId}/publicStageData/{stageId}/chats/{chatId}',
    timeoutSeconds: 60, // Maximum timeout of 1 minute for typing delay.
  },
  async (event) => {
    const experimentId = event.params.experimentId;
    const cohortId = event.params.cohortId;
    const stageId = event.params.stageId;

    await app.firestore().runTransaction(async (transaction) => {
      // Use experiment config to get ChatStageConfig with agents.
      const stage = await getChatStage(experimentId, stageId, transaction);
      if (!stage) {
        return;
      }

      const publicStageData = await getChatStagePublicData(
        experimentId,
        cohortId,
        stageId,
        transaction,
      );
      // Make sure the conversation hasn't ended.
      if (!publicStageData || Boolean(publicStageData.discussionEndTimestamp))
        return;

      // Use chats in collection to build chat history for prompt, get num chats
      const chatMessages = await getChatMessages(
        experimentId,
        cohortId,
        stageId,
        transaction,
      );

      // Get mediators for current cohort and stage
      const mediators = await getMediatorsInCohortStage(
        experimentId,
        cohortId,
        stageId,
        transaction,
      );

      // For each active agent mediator, attempt to create/send chat response
      for (const mediator of mediators) {
        const promptConfig = await getAgentChatPrompt(
          experimentId,
          stageId,
          mediator.agentConfig!.agentId,
          transaction,
        );
        if (!promptConfig) continue;
        const response = await getAgentChatAPIResponse(
          mediator, // profile
          experimentId,
          cohortId,
          mediator.id,
          '', // no past stage context
          chatMessages,
          mediator.agentConfig!,
          promptConfig,
          stage,
          transaction,
        );
        if (!response) continue;

        // Build chat message to send
        const explanation =
          response.parsed[
            response.promptConfig.structuredOutputConfig?.explanationField
          ] ?? '';
        const chatMessage = createMediatorChatMessage({
          profile: response.profile,
          discussionId: publicStageData.currentDiscussionId,
          message: response.message,
          timestamp: Timestamp.now(),
          senderId: response.profileId,
          agentId: response.agentId,
          explanation,
        });
        await sendAgentChatMessage(
          chatMessage,
          response,
          chatMessages.length,
          experimentId,
          cohortId,
          stageId,
          event.params.chatId,
          transaction,
        );
      }
    });
  },
);

/** When chat message is created, generate agent participant response. */
export const createAgentParticipantMessage = onDocumentCreated(
  {
    document:
      'experiments/{experimentId}/cohorts/{cohortId}/publicStageData/{stageId}/chats/{chatId}',
    timeoutSeconds: 60, // Maximum timeout of 1 minute for typing delay.
  },
  async (event) => {
    const experimentId = event.params.experimentId;
    const stageId = event.params.stageId;
    const cohortId = event.params.cohortId;

    await app.firestore().runTransaction(async (transaction) => {
      // Use experiment config to get ChatStageConfig with agents.
      const stage = await getChatStage(experimentId, stageId, transaction);
      if (!stage || stage.kind !== StageKind.CHAT) {
        return;
      }

      const publicStageData = await getChatStagePublicData(
        experimentId,
        cohortId,
        stageId,
        transaction,
      );
      // Make sure the conversation hasn't ended.
      if (!publicStageData || Boolean(publicStageData.discussionEndTimestamp))
        return;

      // Use chats in collection to build chat history for prompt, get num chats
      const chatMessages = await getChatMessages(
        experimentId,
        cohortId,
        stageId,
        transaction,
      );

      // Get agent participants for current cohort and stage
      const activeParticipants = await getFirestoreActiveParticipants(
        experimentId,
        cohortId,
        stageId,
        true, // must be agent
        transaction,
      );

      // For each active agent participant, attempt to create/send chat response
      for (const participant of activeParticipants) {
        if (!participant.agentConfig) continue;
        const promptConfig =
          (await getAgentChatPrompt(
            experimentId,
            stageId,
            participant.agentConfig.agentId,
            transaction,
          )) ??
          createAgentChatPromptConfig(
            stageId,
            StageKind.CHAT,
            AgentPersonaType.PARTICIPANT,
            {promptContext: DEFAULT_AGENT_PARTICIPANT_CHAT_PROMPT},
          );

        const pastStageContext = promptConfig.promptSettings.includeStageHistory
          ? await getPastStagesPromptContext(
              experimentId,
              stageId,
              participant.privateId,
              promptConfig.promptSettings.includeStageInfo,
            )
          : '';

        const response = await getAgentChatAPIResponse(
          participant, // profile
          experimentId,
          cohortId,
          participant.publicId,
          pastStageContext,
          chatMessages,
          participant.agentConfig,
          promptConfig,
          stage,
          transaction,
        );
        if (!response) continue;

        // Build chat message to send
        const explanation =
          response.parsed[
            response.promptConfig.structuredOutputConfig?.explanationField
          ] ?? '';
        if (!publicStageData || !publicStageData.currentDiscussionId) continue;
        const chatMessage = createParticipantChatMessage({
          profile: response.profile,
          discussionId: publicStageData.currentDiscussionId,
          message: response.message,
          timestamp: Timestamp.now(),
          senderId: response.profileId,
          agentId: response.agentId,
          explanation,
        });
        await sendAgentChatMessage(
          chatMessage,
          response,
          chatMessages.length,
          experimentId,
          cohortId,
          stageId,
          event.params.chatId,
          transaction,
        );
      }
    });
  },
);

/** When chat message is created, check if agent participants are
 * ready to end chat.
 */
export const checkReadyToEndChat = onDocumentCreated(
  {
    document:
      'experiments/{experimentId}/cohorts/{cohortId}/publicStageData/{stageId}/chats/{chatId}',
    timeoutSeconds: 60, // Maximum timeout of 1 minute for typing delay.
  },
  async (event) => {
    await app.firestore().runTransaction(async (transaction) => {
      // Use experiment config to get ChatStageConfig with agents.
      // TODO: Add separate readyToEndChat trigger for other stages with chat
      const stage = await getChatStage(
        event.params.experimentId,
        event.params.stageId,
      );
      if (!stage || stage?.kind !== StageKind.CHAT) {
        return;
      }

      const publicStageData = await getChatStagePublicData(
        event.params.experimentId,
        event.params.cohortId,
        event.params.stageId,
      );

      // Get experiment
      const experimentDoc = app
        .firestore()
        .collection('experiments')
        .doc(event.params.experimentId);
      const experiment = (await experimentDoc.get()).data() as Experiment;

      // Use chats in collection to build chat history for prompt, get num chats
      const chatMessages = await getChatMessages(
        event.params.experimentId,
        event.params.cohortId,
        event.params.stageId,
      );

      // Get agent participants for current cohort and stage
      const activeParticipants = await getFirestoreActiveParticipants(
        event.params.experimentId,
        event.params.cohortId,
        event.params.stageId,
        true, // must be agent
      );

      // For each participant, check if ready to end chat
      const promptConfig = createAgentChatPromptConfig(
        event.params.stageId,
        StageKind.CHAT,
        AgentPersonaType.PARTICIPANT,
        {
          promptContext:
            'Are you ready to end the conversation and stop talking? Please consider whether you have met your goals and explicitly communicated this to other participants. If you have more to say or have yet to explicitly agree in the chat, you should not end the discussion yet. If so, respond the exact word YES. Otherwise, do not return anything.',
        },
      );

      for (const participant of activeParticipants) {
        // Make sure participant has not already moved on
        // to a different stage
        const refreshedParticipant = await getFirestoreParticipant(
          event.params.experimentId,
          participant.privateId,
        );
        if (refreshedParticipant?.currentStageId !== event.params.stageId) {
          return;
        }

        // TODO: Use regular participant decision-making prompt, not chat prompt
        const pastStageContext = promptConfig.promptSettings.includeStageHistory
          ? await getPastStagesPromptContext(
              event.params.experimentId,
              event.params.stageId,
              participant.privateId,
              promptConfig.promptSettings.includeStageInfo,
            )
          : '';

        const response = await getAgentChatAPIResponse(
          participant, // profile
          event.params.experimentId,
          event.params.cohortId,
          participant.publicId,
          pastStageContext,
          chatMessages,
          participant.agentConfig!,
          promptConfig,
          stage,
        );
        console.log(participant.publicId, 'ready to end discussion?', response);

        // TODO: Use structured output instead of checking for YES string
        // If not ready to move on, do nothing
        if (!response?.message.includes('YES')) {
          break;
        }

        // If threaded discussion (and not last thread), move to next thread
        if (
          stage.discussions.length > 0 &&
          publicStageData &&
          publicStageData.currentDiscussionId &&
          publicStageData.currentDiscussionId !==
            stage.discussions[stage.discussions.length - 1].id
        ) {
          const chatAnswer = await getFirestoreParticipantAnswer(
            event.params.experimentId,
            participant.privateId,
            event.params.stageId,
          );
          const participantAnswer =
            chatAnswer?.kind === StageKind.CHAT
              ? (chatAnswer as ChatStageParticipantAnswer)
              : createChatStageParticipantAnswer({id: stage.id});

          // Set ready to end timestamp if not already set
          if (
            !participantAnswer.discussionTimestampMap[
              publicStageData.currentDiscussionId
            ]
          ) {
            participantAnswer.discussionTimestampMap[
              publicStageData.currentDiscussionId
            ] = Timestamp.now();
            const participantAnswerDoc = getFirestoreParticipantAnswerRef(
              event.params.experimentId,
              participant.privateId,
              event.params.stageId,
            );
            await transaction.set(participantAnswerDoc, participantAnswer);
          }
        } else {
          // Otherwise, move to next stage
          await updateParticipantNextStage(
            event.params.experimentId,
            participant,
            experiment.stageIds,
          );

          const participantDoc = getFirestoreParticipantRef(
            event.params.experimentId,
            participant.privateId,
          );
          await transaction.set(participantDoc, participant);
        }
      } // end of active participants for loop
    });
  },
);
