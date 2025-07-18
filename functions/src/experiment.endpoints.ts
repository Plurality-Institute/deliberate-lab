import {Value} from '@sinclair/typebox/value';
import {
  Experiment,
  ExperimentCreationData,
  ExperimentDeletionData,
  createExperimentConfig,
} from '@deliberation-lab/utils';

import * as functions from 'firebase-functions';
import {onCall} from 'firebase-functions/v2/https';

import {app} from './app';
import {AuthGuard} from './utils/auth-guard';
import {
  checkConfigDataUnionOnPath,
  isUnionError,
  prettyPrintError,
  prettyPrintErrors,
} from './utils/validation';

/** Create, update, and delete experiments and experiment templates. */

// ************************************************************************* //
// writeExperiment endpoint                                                  //
// (create new experiment to specified Firestore collection)                 //
//                                                                           //
// Input structure: { collectionName, experimentConfig, stageConfigs }       //
// Validation: utils/src/experiment.validation.ts                            //
// ************************************************************************* //
export const writeExperiment = onCall(async (request) => {
  await AuthGuard.isExperimenter(request);
  const {data} = request;

  // Set up experiment config with stageIds
  const experimentConfig = createExperimentConfig(
    data.stageConfigs,
    data.experimentConfig,
  );

  // Define document reference
  const document = app
    .firestore()
    .collection(data.collectionName)
    .doc(experimentConfig.id);

  // If experiment exists, do not allow creation.
  if ((await document.get()).exists) {
    return {id: ''};
  }

  // Use current experimenter as creator
  experimentConfig.metadata.creator = request.auth.token.email;

  // Run document write as transaction to ensure consistency
  await app.firestore().runTransaction(async (transaction) => {
    transaction.set(document, experimentConfig);

    // Add collection of stages
    for (const stage of data.stageConfigs) {
      transaction.set(document.collection('stages').doc(stage.id), stage);
    }

    // Add agent configs and prompts
    for (const agent of data.agentConfigs) {
      const agentDoc = document.collection('agents').doc(agent.persona.id);
      transaction.set(agentDoc, agent.persona);
      for (const prompt of Object.values(agent.participantPromptMap)) {
        transaction.set(
          agentDoc.collection('participantPrompts').doc(prompt.id),
          prompt,
        );
      }
      for (const prompt of Object.values(agent.chatPromptMap)) {
        transaction.set(
          agentDoc.collection('chatPrompts').doc(prompt.id),
          prompt,
        );
      }
    }
  });

  return {id: document.id};
});

// ************************************************************************* //
// updateExperiment endpoint                                                 //
// (Update existing experiment to specified Firestore collection)            //
//                                                                           //
// Input structure: { collectionName, experimentConfig, stageConfigs }       //
// Validation: utils/src/experiment.validation.ts                            //
// ************************************************************************* //
export const updateExperiment = onCall(async (request) => {
  await AuthGuard.isExperimenter(request);
  const {data} = request;

  // Set up experiment config with stageIds
  const experimentConfig = createExperimentConfig(
    data.stageConfigs,
    data.experimentConfig,
  );

  // Define document reference
  const document = app
    .firestore()
    .collection(data.collectionName)
    .doc(experimentConfig.id);

  // If experiment does not exist, return false
  const oldExperiment = await document.get();
  if (!oldExperiment.exists) {
    return {success: false};
  }
  // Verify that the experimenter is the creator
  // TODO: Enable admins to update experiment?
  if (request.auth?.token.email !== oldExperiment.data().metadata.creator) {
    return {success: false};
  }

  // Run document write as transaction to ensure consistency
  await app.firestore().runTransaction(async (transaction) => {
    transaction.set(document, experimentConfig);

    // Clean up obsolete docs in stages, agents collections.
    const oldStageCollection = document.collection('stages');
    const oldAgentCollection = document.collection('agents');
    await app.firestore().recursiveDelete(oldStageCollection);
    await app.firestore().recursiveDelete(oldAgentCollection);

    // Add updated collection of stages
    for (const stage of data.stageConfigs) {
      transaction.set(document.collection('stages').doc(stage.id), stage);
    }

    // Add agent configs and prompts
    for (const agent of data.agentConfigs) {
      const agentDoc = document.collection('agents').doc(agent.persona.id);
      transaction.set(agentDoc, agent.persona);
      for (const prompt of Object.values(agent.participantPromptMap)) {
        transaction.set(
          agentDoc.collection('participantPrompts').doc(prompt.id),
          prompt,
        );
      }
      for (const prompt of Object.values(agent.chatPromptMap)) {
        transaction.set(
          agentDoc.collection('chatPrompts').doc(prompt.id),
          prompt,
        );
      }
    }
  });

  return {success: true};
});

// ************************************************************************* //
// deleteExperiment endpoint                                                 //
// (recursively remove experiment doc and subcollections)                    //
//                                                                           //
// Input structure: { collectionName, experimentId }                         //
// Validation: utils/src/experiment.validation.ts                            //
// ************************************************************************* //
export const deleteExperiment = onCall(async (request) => {
  await AuthGuard.isExperimenter(request);
  const {data} = request;

  // Validate input
  const validInput = Value.Check(ExperimentDeletionData, data);
  if (!validInput) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid data');
    return {success: false};
  }

  // Verify that experimenter is the creator before enabling delete
  // TODO: Enable admins to delete?
  const experiment = (
    await app
      .firestore()
      .collection(data.collectionName)
      .doc(data.experimentId)
      .get()
  ).data();
  if (request.auth?.token.email !== experiment.metadata.creator)
    return {success: false};

  // Delete document
  const doc = app
    .firestore()
    .doc(`${data.collectionName}/${data.experimentId}`);
  app.firestore().recursiveDelete(doc);
  return {success: true};
});

// ************************************************************************* //
// setExperimentCohortLock for experimenters                                 //
//                                                                           //
// Input structure: { experimentId, cohortId, isLock }                       //
// Validation: utils/src/experiment.validation.ts                            //
// ************************************************************************* //
// TODO: Move isLock under CohortConfig instead of Experiment config?
export const setExperimentCohortLock = onCall(async (request) => {
  // TODO: Only allow creator, admins, and readers to set lock
  await AuthGuard.isExperimenter(request);
  const {data} = request;

  // Define document reference
  const document = app
    .firestore()
    .collection('experiments')
    .doc(data.experimentId);

  // Run document write as transaction to ensure consistency
  await app.firestore().runTransaction(async (transaction) => {
    const experiment = (await document.get()).data() as Experiment;
    experiment.cohortLockMap[data.cohortId] = data.isLock;
    transaction.set(document, experiment);
  });

  return {success: true};
});
