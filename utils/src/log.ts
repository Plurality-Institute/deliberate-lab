import {UnifiedTimestamp, generateId} from './shared';
import {Timestamp} from 'firebase/firestore';
import {ApiKeyType} from './agent';

/** Define experiment log. */

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
  apiType: ApiKeyType; // Which API was used (Gemini, OpenAI, Ollama)
  modelName: string; // Model name used
  prompt: string; // Full prompt sent to LLM
  response: string; // Full response from LLM
  responseStatus: string; // Status of response (OK, ERROR, etc.)
  errorMessage: string; // Error message if response failed (empty string if no error)
  temperature: number; // Temperature setting used (0 if not set)
  maxTokens: number; // Max tokens setting (0 if not set)
  timestamp: UnifiedTimestamp;
}

export function createLlmCallLog(config: Partial<LlmCallLog> = {}): LlmCallLog {
  return {
    id: config.id ?? generateId(),
    experimentId: config.experimentId ?? '',
    cohortId: config.cohortId ?? '',
    stageId: config.stageId ?? '',
    participantId: config.participantId ?? '',
    agentId: config.agentId ?? '',
    apiType: config.apiType ?? ApiKeyType.GEMINI_API_KEY,
    modelName: config.modelName ?? '',
    prompt: config.prompt ?? '',
    response: config.response ?? '',
    responseStatus: config.responseStatus ?? '',
    errorMessage: config.errorMessage ?? '',
    temperature: config.temperature ?? 0,
    maxTokens: config.maxTokens ?? 0,
    timestamp: config.timestamp ?? Timestamp.now(),
  };
}
