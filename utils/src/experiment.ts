import {
  MetadataConfig,
  PermissionsConfig,
  createMetadataConfig,
  createPermissionsConfig,
  generateId
} from './shared';
import { StageConfig } from './stages/stage';

/** Experiment types and functions. */

// ************************************************************************* //
// TYPES                                                                     //
// ************************************************************************* //

/** Increment this ID when Firestore objects are updated in a way that
  * impacts loading previous versions of those objects on the frontend
  * (e.g., new field is added to existing stage config).
  *
  * VERSION 5 - updated in PR #334 to add completedWaiting map
  * to participant progress timestamps
  * VERSION 6 - updated in PR #337 to remove attention check config
  * VERSION 7 - updated in PR #348 to store additional chip negotiation data
  */
export const EXPERIMENT_VERSION_ID = 7;

/** Experiment. */
export interface Experiment {
  id: string;
  // Track current version for backwards compatibility
  versionId: number;
  metadata: MetadataConfig;
  permissions: PermissionsConfig;  
  defaultCohortConfig: CohortParticipantConfig; // used by default for cohorts
  prolificConfig: ProlificConfig;
  stageIds: string[]; // Ordered list of stage IDs
}

/** Experiment config for participant options. */
export interface CohortParticipantConfig {
  // Min number of participants required for experiment cohort to begin
  // (or null if no requirement)
  minParticipantsPerCohort: number|null;
  // Max number of participants for experiment cohort (or null if no limit)
  maxParticipantsPerCohort: number|null;
  // If false, exclude booted participant from min/max participant counts
  includeAllParticipantsInCohortCount: boolean;
}

/** Prolific integration config. */
export interface ProlificConfig {
  enableProlificIntegration: boolean;
  defaultRedirectCode: string;
  attentionFailRedirectCode: string;
  bootedRedirectCode: string;
}

/** Experiment template with stage configs preloaded. */
export interface ExperimentTemplate extends Experiment {
  stageMap: Record<string, StageConfig>;
}

// ************************************************************************* //
// FUNCTIONS                                                                 //
// ************************************************************************* //

/** Create experiment. */
export function createExperimentConfig(
  stages: StageConfig[] = [],
  config: Partial<Experiment> = {},
): Experiment {
  return {
    id: config.id ?? generateId(),
    versionId: EXPERIMENT_VERSION_ID,
    metadata: config.metadata ?? createMetadataConfig(),
    permissions: config.permissions ?? createPermissionsConfig(),
    defaultCohortConfig: config.defaultCohortConfig ?? createCohortParticipantConfig(),
    prolificConfig: config.prolificConfig ?? createProlificConfig(),
    stageIds: stages.map(stage => stage.id),
  };
}

/** Create CohortParticipantConfig. */
export function createCohortParticipantConfig(
  config: Partial<CohortParticipantConfig> = {},
): CohortParticipantConfig {
  return {
    minParticipantsPerCohort: config.minParticipantsPerCohort ?? null,
    maxParticipantsPerCohort: config.maxParticipantsPerCohort ?? null,
    includeAllParticipantsInCohortCount: config.includeAllParticipantsInCohortCount ?? false,
  };
}

/** Create ProlificConfig. */
export function createProlificConfig(
  config: Partial<ProlificConfig> = {},
): ProlificConfig {
  return {
    enableProlificIntegration: config.enableProlificIntegration ?? false,
    defaultRedirectCode: config.defaultRedirectCode ?? '',
    attentionFailRedirectCode: config.attentionFailRedirectCode ?? '',
    bootedRedirectCode: config.bootedRedirectCode ?? '',
  };
}
