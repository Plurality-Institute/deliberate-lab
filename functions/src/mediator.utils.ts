import {
  AgentChatPromptConfig,
  CohortConfig,
  MediatorProfile,
  createMediatorProfileFromAgentPersona,
} from '@deliberation-lab/utils';
import {getAgentPersonas} from './agent.utils';

import {app} from './app';

/** Create mediators for all agent personas with isDefaultAddToCohort true. */
export async function createMediatorsForCohort(
  experimentId: string,
  cohort: CohortConfig,
): Promise<MediatorProfile[]> {
  const cohortId = cohort.id;
  const personas = await getAgentPersonas(experimentId);
  const mediators: MediatorProfile[] = [];
  const experimentalCondition = cohort?.experimentalCondition || '';
  for (const persona of personas) {
    if (persona.isDefaultAddToCohort) {
      const chatPrompts = (
        await app
          .firestore()
          .collection('experiments')
          .doc(experimentId)
          .collection('agents')
          .doc(persona.id)
          .collection('chatPrompts')
          .get()
      ).docs.map((doc) => doc.data() as AgentChatPromptConfig);
      // For each chat prompt, check if HIDE for this condition
      let shouldAdd = false;
      for (const prompt of chatPrompts) {
        const conditionConfig =
          prompt.experimentalConditionConfig?.[experimentalCondition] ||
          prompt.experimentalConditionConfig?._default;
        const responseType = conditionConfig?.responseType || 'llm';
        if (responseType !== 'hide') {
          shouldAdd = true;
          break;
        }
      }
      if (shouldAdd) {
        const mediator = createMediatorProfileFromAgentPersona(
          cohortId,
          persona,
          chatPrompts.map((prompt) => prompt.id),
        );
        mediators.push(mediator);
      }
    }
  }
  return mediators;
}

/** Return all mediators for given cohort and stage. */
export async function getMediatorsInCohortStage(
  experimentId: string,
  cohortId: string,
  stageId: string,
): Promise<MediatorProfile[]> {
  return (
    await app
      .firestore()
      .collection('experiments')
      .doc(experimentId)
      .collection('mediators')
      .where('currentCohortId', '==', cohortId)
      .get()
  ).docs
    .map((doc) => doc.data() as MediatorProfile)
    .filter((mediator) => mediator.activeStageMap[stageId]);
}
