import {
  ParticipantProfileBase,
  createParticipantProfileBase,
} from './participant';
import {generateId} from './shared';
import {StageKind} from './stages/stage';
import {
  DEFAULT_AGENT_MEDIATOR_PROMPT,
  DEFAULT_AGENT_PARTICIPANT_CHAT_PROMPT,
} from './stages/chat_stage.prompts';
import {
  StructuredOutputConfig,
  createStructuredOutputConfig,
} from './structured_output';

/** Agent types and functions. */

// ************************************************************************* //
// TYPES                                                                     //
// ************************************************************************* //
export interface CustomRequestBodyField {
  name: string;
  value: string;
}

/** Specifies which API to use for model calls. */
// TODO: Rename enum (ApiType? LLMApiType?)
export enum ApiKeyType {
  GEMINI_API_KEY = 'GEMINI',
  OPENAI_API_KEY = 'OPENAI',
  OLLAMA_CUSTOM_URL = 'OLLAMA',
}

/** Agent config applied to ParticipantProfile or MediatorProfile. */
export interface ProfileAgentConfig {
  agentId: string; // ID of agent persona used
  promptContext: string; // Additional text to concatenate to agent prompts
  modelSettings: AgentModelSettings;
}

/** Generation config for a specific stage's model call. */
export interface ModelGenerationConfig {
  maxTokens: number; // Max tokens per model call response
  stopSequences: string[];
  temperature: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  // TODO(mkbehr): Add response MIME type and schema
  customRequestBodyFields: CustomRequestBodyField[];
}

export interface AgentGenerationConfig {
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  customRequestBodyFields?: {name: string; value: string}[];
}

/** Model settings for a specific agent. */
export interface AgentModelSettings {
  apiType: ApiKeyType;
  modelName: string;
}

export interface AgentPromptSettings {
  // Number of times to retry prompt call if it fails
  numRetries: number;
  // Whether or not to include context from all previously completed
  // stages
  includeStageHistory: boolean;
  // Whether or not to include information (stage description/info/help)
  // shown to users
  includeStageInfo: boolean;
  // TODO(mkbehr): Add few-shot examples
  // (that align with generation config's response schema)
}

/** Model settings for agent in a chat discussion. */
export interface AgentChatSettings {
  // Agent's "typing speed" during the chat conversation
  wordsPerMinute: number;
  // Number of chat messages that must exist before the agent can respond
  minMessagesBeforeResponding: number;
  // Whether the agent can respond multiple times in a row
  // (i.e., whether an agent's own message can trigger a new model call)
  canSelfTriggerCalls: boolean;
  // Maximum total responses agent can make during the chat conversation
  // (or null if no max)
  maxResponses: number | null;
}

/** DEPRECATED: Settings for formatting agent response
 *  (e.g., expect JSON, use specific JSON field for response, use end token)
 *  New config is StructuredOutputConfig.
 */
export interface AgentResponseConfig {
  isJSON: boolean;
  // JSON field to extract chat message from
  messageField: string;
  // JSON field to extract explanation from
  explanationField: string;
  formattingInstructions: string;
}

/** Specifies how prompt should be sent to API. */
export interface BaseAgentPromptConfig {
  id: string; // stage ID
  type: StageKind; // stage type
  promptContext: string; // custom prompt content
  generationConfig: ModelGenerationConfig;
  promptSettings: AgentPromptSettings;
  structuredOutputConfig: StructuredOutputConfig;
}

/** Prompt config for completing stage (e.g., survey questions). */
export type AgentParticipantPromptConfig = BaseAgentPromptConfig;

export enum AgentChatResponseType {
  STATIC = 'static', // Fixed response (e.g., "Come come, elucidate your thoughts.")
  LLM = 'llm', // LLM-generated response
  NONE = 'none', // No response, but the agent is still present in the chat
  HIDE = 'hide', // Hide the agent entirely
}

export interface AgentExperimentalConditionConfig {
  // Condition name isn't here, since it will be the key in the config map
  responseType: AgentChatResponseType;
  staticMessage?: string; // Static message to use if responseType is STATIC
}

/** Prompt config for sending chat messages
 * (sent to specified API on stage's chat trigger)
 */
export interface AgentChatPromptConfig extends BaseAgentPromptConfig {
  chatSettings: AgentChatSettings;
  // DEPRECATED: Use structuredOutputConfig, not responseConfig
  responseConfig?: AgentResponseConfig;
  // Optional: LLM prompt and config for deciding whether to respond
  shouldRespondPromptContext?: string;
  shouldRespondModelSettings?: AgentModelSettings;
  shouldRespondGenerationConfig?: ModelGenerationConfig;
  shouldRespondStructuredOutputConfig?: StructuredOutputConfig;
  experimentalConditionConfig?: Record<
    string,
    AgentExperimentalConditionConfig
  >;
}

export enum AgentPersonaType {
  PARTICIPANT = 'participant',
  MEDIATOR = 'mediator',
}

/** Top-level agent persona config (basically, template for agents). */
export interface AgentPersonaConfig {
  id: string;
  // Viewable only to experimenters
  name: string;
  // Agent persona type
  type: AgentPersonaType;
  // If true, add to cohort on cohort creation
  isDefaultAddToCohort: boolean;
  defaultProfile: ParticipantProfileBase;
  defaultModelSettings: AgentModelSettings;
}

/** Format used to send agent data from frontend to backend. */
export interface AgentDataObject {
  persona: AgentPersonaConfig;
  // Maps from stage ID to prompt for completing stage
  participantPromptMap: Record<string, AgentParticipantPromptConfig>;
  // Maps from stage ID to prompt for sending chat messages
  chatPromptMap: Record<string, AgentChatPromptConfig>;
}

// ************************************************************************* //
// CONSTANTS                                                                 //
// ************************************************************************* //
export const DEFAULT_AGENT_API_TYPE = ApiKeyType.GEMINI_API_KEY;

export const DEFAULT_AGENT_API_MODEL = 'gemini-1.5-pro-latest';

export const DEFAULT_AGENT_MODEL_SETTINGS: AgentModelSettings = {
  apiType: DEFAULT_AGENT_API_TYPE,
  modelName: DEFAULT_AGENT_API_MODEL,
};

// ************************************************************************* //
// FUNCTIONS                                                                 //
// ************************************************************************* //

export function createAgentModelSettings(
  config: Partial<AgentModelSettings> = {},
): AgentModelSettings {
  return {
    // TODO: pick first API that has a valid key?
    apiType: config.apiType ?? DEFAULT_AGENT_API_TYPE,
    // TODO: pick model name that matches API?
    modelName: config.modelName ?? DEFAULT_AGENT_API_MODEL,
  };
}

export function createModelGenerationConfig(
  config: Partial<ModelGenerationConfig> = {},
): ModelGenerationConfig {
  return {
    maxTokens: config.maxTokens ?? 8192,
    stopSequences: config.stopSequences ?? [],
    temperature: config.temperature ?? 1.0,
    topP: config.topP ?? 1.0,
    frequencyPenalty: config.frequencyPenalty ?? 0.0,
    presencePenalty: config.presencePenalty ?? 0.0,
    customRequestBodyFields: config.customRequestBodyFields ?? [],
  };
}

export function createAgentChatSettings(
  config: Partial<AgentChatSettings> = {},
): AgentChatSettings {
  return {
    wordsPerMinute: config.wordsPerMinute ?? 100,
    minMessagesBeforeResponding: config.minMessagesBeforeResponding ?? 0,
    canSelfTriggerCalls: config.canSelfTriggerCalls ?? false,
    maxResponses: config.maxResponses ?? 100,
  };
}

export function createAgentPromptSettings(
  config: Partial<AgentPromptSettings> = {},
): AgentPromptSettings {
  return {
    numRetries: config.numRetries ?? 0,
    includeStageHistory: config.includeStageHistory ?? true,
    includeStageInfo: config.includeStageInfo ?? true,
  };
}

export function createAgentChatPromptConfig(
  id: string, // stage ID
  type: StageKind, // stage kind
  personaType: AgentPersonaType, // mediator or participant
  config: Partial<AgentChatPromptConfig> = {},
): AgentChatPromptConfig {
  return {
    id,
    type,
    promptContext:
      config.promptContext ??
      (personaType === AgentPersonaType.MEDIATOR
        ? DEFAULT_AGENT_MEDIATOR_PROMPT
        : DEFAULT_AGENT_PARTICIPANT_CHAT_PROMPT),
    promptSettings: config.promptSettings ?? createAgentPromptSettings(),
    generationConfig: config.generationConfig ?? createModelGenerationConfig(),
    chatSettings: config.chatSettings ?? createAgentChatSettings(),
    structuredOutputConfig:
      config.structuredOutputConfig ?? createStructuredOutputConfig(),
    shouldRespondPromptContext: config.shouldRespondPromptContext,
    shouldRespondModelSettings: config.shouldRespondModelSettings,
    shouldRespondGenerationConfig: config.shouldRespondGenerationConfig,
    shouldRespondStructuredOutputConfig:
      config.shouldRespondStructuredOutputConfig,
    experimentalConditionConfig:
      config.experimentalConditionConfig ?? createExperimentalConditionConfig(),
  };
}

export function createAgentPersonaConfig(
  config: Partial<AgentPersonaConfig> = {},
): AgentPersonaConfig {
  const type = config.type ?? AgentPersonaType.MEDIATOR;
  return {
    id: config.id ?? generateId(),
    name: config.name ?? '',
    type,
    isDefaultAddToCohort: config.isDefaultAddToCohort ?? true,
    defaultProfile:
      config.defaultProfile ??
      createParticipantProfileBase({
        name: type === AgentPersonaType.MEDIATOR ? 'Mediator' : '',
        avatar: '🙋',
      }),
    defaultModelSettings:
      config.defaultModelSettings ?? createAgentModelSettings(),
  };
}

export function createAgentParticipantPersonaConfig(
  config: Partial<AgentPersonaConfig> = {},
): AgentPersonaConfig {
  return {
    id: config.id ?? generateId(),
    name: config.name ?? 'Agent Participant',
    type: AgentPersonaType.PARTICIPANT,
    isDefaultAddToCohort: config.isDefaultAddToCohort ?? false,
    defaultProfile:
      config.defaultProfile ??
      createParticipantProfileBase({
        name: '',
        avatar: '',
      }),
    defaultModelSettings:
      config.defaultModelSettings ?? createAgentModelSettings(),
  };
}

export function createExperimentalConditionConfig(
  config: Record<string, AgentExperimentalConditionConfig> = {},
): Record<string, AgentExperimentalConditionConfig> {
  return {
    // Default condition for agent chat responses, used if specified condition is missing
    _default: {
      responseType: AgentChatResponseType.LLM,
    },
    ...config,
  };
}
