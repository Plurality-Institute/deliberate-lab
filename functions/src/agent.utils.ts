import {Timestamp} from 'firebase-admin/firestore';
import {
  AgentModelSettings,
  AgentParticipantPromptConfig,
  AgentPersonaConfig,
  ApiKeyType,
  ExperimenterData,
  ModelGenerationConfig,
  ParticipantProfileExtended,
  ParticipantStatus,
  StageKind,
  StructuredOutputConfig,
  makeStructuredOutputPrompt,
} from '@deliberation-lab/utils';
import {ModelResponse} from './api/model.response';

import {updateParticipantNextStage} from './participant.utils';
import {initiateChatDiscussion} from './stages/chat.utils';
import {completeProfile} from './stages/profile.utils';
import {getAgentParticipantRankingStageResponse} from './stages/ranking.utils';
import {getAgentParticipantSurveyStageResponse} from './stages/survey.utils';

import {ModelResponseStatus} from './api/model.response';
import {getGeminiAPIResponse} from './api/gemini.api';
import {getOpenAIAPIChatCompletionResponse} from './api/openai.api';
import {ollamaChat} from './api/ollama.api';

import {
  getExperimenterData,
  getFirestoreParticipantRef,
  getFirestoreStage,
} from './utils/firestore';

import {app} from './app';

export async function getAgentResponse(
  data: ExperimenterData, // TODO: Only pass in API keys
  prompt: string,
  modelSettings: AgentModelSettings,
  generationConfig: ModelGenerationConfig,
  structuredOutputConfig?: StructuredOutputConfig,
): Promise<ModelResponse> {
  let response;

  // This seems to be duplicated. Like the structuredOutputConfig gets
  // added to the prompt in another place too, and then we have the json
  // schema twice.
  //
  // const structuredOutputPrompt = structuredOutputConfig
  //   ? makeStructuredOutputPrompt(structuredOutputConfig)
  //   : '';
  // if (structuredOutputPrompt) {
  //   prompt = `${prompt}\n${structuredOutputPrompt}`;
  // }

  if (modelSettings.apiType === ApiKeyType.GEMINI_API_KEY) {
    response = await getGeminiResponse(
      data,
      modelSettings.modelName,
      prompt,
      generationConfig,
      structuredOutputConfig,
    );
  } else if (modelSettings.apiType === ApiKeyType.OPENAI_API_KEY) {
    response = await getOpenAIAPIResponse(
      data,
      modelSettings.modelName,
      prompt,
      generationConfig,
      structuredOutputConfig,
    );
  } else if (modelSettings.apiType === ApiKeyType.OLLAMA_CUSTOM_URL) {
    response = await getOllamaResponse(data, modelSettings.modelName, prompt);
  } else {
    response = {
      status: ModelResponseStatus.CONFIG_ERROR,
      errorMessage: `Error: invalid apiKey type: ${data.apiKeys.ollamaApiKey.apiKey}`,
    };
  }

  if (response.status !== ModelResponseStatus.OK) {
    console.error(
      `GetAgentResponse: response error status: ${response.status}; message: ${response.errorMessage}`,
    );
  }

  console.log('llm response:', response);

  return response;
}

// TODO: Refactor model call functions to take in direct API configs,
// not full ExperimenterData

export async function getGeminiResponse(
  data: ExperimenterData,
  modelName: string,
  prompt: string,
  generationConfig: ModelGenerationConfig,
  structuredOutputConfig?: StructuredOutputConfig,
): Promise<ModelResponse> {
  return await getGeminiAPIResponse(
    data.apiKeys.geminiApiKey,
    modelName,
    prompt,
    generationConfig,
    structuredOutputConfig,
  );
}

export async function getOpenAIAPIResponse(
  data: ExperimenterData,
  model: string,
  prompt: string,
  generationConfig: ModelGenerationConfig,
): Promise<ModelResponse> {
  return await getOpenAIAPIChatCompletionResponse(
    data.apiKeys.openAIApiKey?.apiKey || '',
    data.apiKeys.openAIApiKey?.baseUrl || null,
    model,
    prompt,
    generationConfig,
  );
}

export async function getOllamaResponse(
  data: ExperimenterData,
  modelName: string,
  prompt: string,
  generationConfig: ModelGenerationConfig,
): Promise<ModelResponse> {
  return await ollamaChat(
    [prompt],
    modelName,
    data.apiKeys.ollamaApiKey,
    generationConfig,
  );
}

/** Return all agent personas for a given experiment. */
export async function getAgentPersonas(experimentId: string) {
  const agentCollection = app
    .firestore()
    .collection('experiments')
    .doc(experimentId)
    .collection('agents');
  return (await agentCollection.get()).docs.map(
    (agent) => agent.data() as AgentPersonaConfig,
  );
}

/** Complete agent participant's current stage. */
export async function completeStageAsAgentParticipant(
  experiment: Experiment,
  participant: ParticipantProfileExtended,
) {
  const experimentId = experiment.id;
  const participantDoc = getFirestoreParticipantRef(
    experimentId,
    participant.privateId,
  );

  // Only update if participant is active, etc.
  const status = participant.currentStatus;
  if (status !== ParticipantStatus.IN_PROGRESS) {
    return;
  }

  // Ensure participants have start experiment, TOS, and current stage
  // ready marked appropriately
  if (!participant.timestamps.startExperiment) {
    participant.timestamps.startExperiment = Timestamp.now();
  }
  if (!participant.timestamps.acceptedTOS) {
    participant.timestamps.acceptedTOS = Timestamp.now();
  }
  if (!participant.timestamps.readyStages[participant.currentStageId]) {
    participant.timestamps.readyStages[participant.currentStageId] =
      Timestamp.now();
  }

  const completeStage = async () => {
    await updateParticipantNextStage(
      experimentId,
      participant,
      experiment.stageIds,
    );
  };

  const stage = await getFirestoreStage(
    experimentId,
    participant.currentStageId,
  );

  // Fetch experiment creator's API key.
  const creatorId = experiment.metadata.creator;
  const experimenterData = await getExperimenterData(creatorId);

  // ParticipantAnswer doc
  const answerDoc = app
    .firestore()
    .collection('experiments')
    .doc(experimentId)
    .collection('participants')
    .doc(participant.privateId)
    .collection('stageData')
    .doc(stage.id);

  switch (stage.kind) {
    case StageKind.CHAT:
      // Do not complete stage as agent participant must chat first
      // Instead, check if participant should initiate conversation
      initiateChatDiscussion(
        experimentId,
        participant.currentCohortId,
        stage,
        participant.privateId,
        participant.publicId,
        participant, // profile
        participant.agentConfig, // agent config
      );
      break;
    case StageKind.PROFILE:
      await completeProfile(experimentId, participant, stage);
      await completeStage();
      participantDoc.set(participant);
      break;
    case StageKind.SALESPERSON:
      initiateChatDiscussion(
        experimentId,
        participant.currentCohortId,
        stage,
        participant.privateId,
        participant.publicId,
        participant, // profile
        participant.agentConfig, // agent config
      );
      break;
    case StageKind.RANKING:
      if (!experimenterData) {
        console.log('Could not find experimenter data and API key');
        break;
      }
      const rankingAnswer = await getAgentParticipantRankingStageResponse(
        experimentId,
        experimenterData,
        participant,
        stage,
      );
      answerDoc.set(rankingAnswer);
      await completeStage();
      participantDoc.set(participant);
      break;
    case StageKind.SURVEY:
      if (!experimenterData) {
        console.log('Could not find experimenter data and API key');
        break;
      }
      const surveyAnswer = await getAgentParticipantSurveyStageResponse(
        experimentId,
        experimenterData,
        participant,
        stage,
      );
      answerDoc.set(surveyAnswer);
      await completeStage();
      participantDoc.set(participant);
      break;
    default:
      console.log(`Move to next stage (${participant.publicId})`);
      await completeStage();
      participantDoc.set(participant);
  }
}

/** Return agent participant prompt that corresponds to agent. */
export async function getAgentParticipantPrompt(
  experimentId: string,
  stageId: string,
  agentId: string,
): AgentParticipantPromptConfig | null {
  const prompt = await app
    .firestore()
    .collection('experiments')
    .doc(experimentId)
    .collection('agents')
    .doc(agentId)
    .collection('participantPrompts')
    .doc(stageId)
    .get();

  if (!prompt.exists) {
    return null;
  }
  return prompt.data() as AgentParticipantPromptConfig;
}
