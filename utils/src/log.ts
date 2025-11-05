import {UnifiedTimestamp, generateId} from './shared';
import {Timestamp} from 'firebase/firestore';
import {ApiKeyType} from './agent';

/** Define experiment log. */

/** Type of LLM call being made. */
export enum LlmCallType {
  CHAT_MESSAGE = 'chat_message', // Generating a chat message response
  SHOULD_RESPOND = 'should_respond', // Deciding whether to respond
  SURVEY_RESPONSE = 'survey_response', // Generating survey answer
  RANKING_RESPONSE = 'ranking_response', // Generating ranking answer
  PROFILE_GENERATION = 'profile_generation', // Generating profile information
  OTHER = 'other', // Other types of LLM calls
}

export interface LogEntry {
  id: string;
  experimentId: string;
  cohortId: string;
  stageId: string;
  participantId: string; // Public ID
  summary: string; // Summary of log
  trace: string; // Longer log data, e.g., prompt or LLM response
  timestamp: UnifiedTimestamp;
}

export function createLogEntry(config: Partial<LogEntry> = {}): LogEntry {
  return {
    id: config.id ?? generateId(),
    experimentId: config.experimentId ?? '',
    cohortId: config.cohortId ?? '',
    stageId: config.stageId ?? '',
    participantId: config.participantId ?? '',
    summary: config.summary ?? '',
    trace: config.trace ?? '',
    timestamp: config.timestamp ?? Timestamp.now(),
  };
}

/** LLM call log for tracking agent/mediator API calls. */
export interface LlmCallLog {
  id: string;
  experimentId: string;
  cohortId: string;
  stageId: string;
  participantId: string; // Public ID (agent or participant)
  agentId: string; // Agent persona ID if this was an agent call (empty string if not)
  callType: LlmCallType; // Type of LLM call being made
  apiType: ApiKeyType; // Which API was used (Gemini, OpenAI, Ollama)
  modelName: string; // Model name used
  prompt: string; // Full prompt sent to LLM
  response: string; // Full response from LLM
  responseStatus: string; // Status of response (OK, ERROR, etc.)
  errorMessage: string; // Error message if response failed (empty string if no error)
  temperature: number; // Temperature setting used (0 if not set)
  maxTokens: number; // Max tokens setting (0 if not set)
  chatMessageIds: string[]; // List of chat message IDs used in prompt (empty if not applicable)
  timestamp: UnifiedTimestamp;
}

export function createLlmCallLog(log: Partial<LlmCallLog> = {}): LlmCallLog {
  return {
    id: log.id ?? generateId(),
    experimentId: log.experimentId ?? '',
    cohortId: log.cohortId ?? '',
    stageId: log.stageId ?? '',
    participantId: log.participantId ?? '',
    agentId: log.agentId ?? '',
    callType: log.callType ?? LlmCallType.OTHER,
    apiType: log.apiType ?? ApiKeyType.GEMINI_API_KEY,
    modelName: log.modelName ?? '',
    prompt: log.prompt ?? '',
    response: log.response ?? '',
    responseStatus: log.responseStatus ?? '',
    errorMessage: log.errorMessage ?? '',
    temperature: log.temperature ?? 0,
    maxTokens: log.maxTokens ?? 0,
    chatMessageIds: log.chatMessageIds ?? [],
    timestamp: log.timestamp ?? Timestamp.now(),
  };
}
