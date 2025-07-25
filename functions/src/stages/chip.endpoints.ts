import {Value} from '@sinclair/typebox/value';
import {
  ChipLogEntry,
  ChipOfferStatus,
  ChipStageConfig,
  ChipStagePublicData,
  SendChipOfferData,
  displayChipOfferText,
  SendChipResponseData,
  SetChipTurnData,
  createChipOfferLogEntry,
  createChipRoundLogEntry,
  createChipTurnLogEntry,
  createChipTransaction,
  generateId,
} from '@deliberation-lab/utils';

import {Timestamp} from 'firebase-admin/firestore';
import {onCall} from 'firebase-functions/v2/https';

import {app} from '../app';
import {
  checkConfigDataUnionOnPath,
  isUnionError,
  prettyPrintError,
  prettyPrintErrors,
} from '../utils/validation';

import {getChipParticipants, updateChipCurrentTurn} from './chip.utils';

/** Manage chip negotiation offers. */

// ************************************************************************* //
// setChipTurn endpoint                                                      //
//                                                                           //
// If game is not over, set current turn based on first participant in       //
// cohort who has not yet submitted an offer for the current round           //
//                                                                           //
// Input structure: {                                                        //
//   experimentId, cohortId, stageId                                         //
// }                                                                         //
// Validation: utils/src/chip.validation.ts                                  //
// ************************************************************************* //
export const setChipTurn = onCall(async (request) => {
  const {data} = request;

  // Validate input
  const validInput = Value.Check(SetChipTurnData, data);
  if (!validInput) {
    handleSetChipTurnValidationErrors(data);
  }

  // Define chip stage config
  const stageDoc = app
    .firestore()
    .collection('experiments')
    .doc(data.experimentId)
    .collection('stages')
    .doc(data.stageId);

  // Define chip stage public data document reference
  const publicDoc = app
    .firestore()
    .collection('experiments')
    .doc(data.experimentId)
    .collection('cohorts')
    .doc(data.cohortId)
    .collection('publicStageData')
    .doc(data.stageId);

  // Define log entry collection reference
  const logCollection = app
    .firestore()
    .collection('experiments')
    .doc(data.experimentId)
    .collection('cohorts')
    .doc(data.cohortId)
    .collection('publicStageData')
    .doc(data.stageId)
    .collection('logs');

  await app.firestore().runTransaction(async (transaction) => {
    const publicStageData = (
      await publicDoc.get()
    ).data() as ChipStagePublicData;

    // If turn is already set, then no action needed
    if (publicStageData.currentTurn !== null) {
      return {success: false};
    }

    // Get relevant (active, in cohort) participant IDs
    const participants = await getChipParticipants(
      data.experimentId,
      data.cohortId,
    );

    // If no participants, then no action needed
    if (participants.length === 0) {
      return {success: false};
    }

    const stageConfig = (await stageDoc.get()).data() as ChipStageConfig;

    const newData = updateChipCurrentTurn(
      publicStageData,
      participants,
      stageConfig.numRounds,
    );

    transaction.set(publicDoc, newData);
    transaction.set(
      logCollection.doc(),
      createChipRoundLogEntry(newData.currentRound, Timestamp.now()),
    );
    transaction.set(
      logCollection.doc(),
      createChipTurnLogEntry(
        newData.currentRound,
        newData.currentTurn,
        Timestamp.now(),
      ),
    );
  }); // end transaction

  return {success: true};
});

// ************************************************************************* //
// sendChipOffer endpoint                                                    //
//                                                                           //
// Input structure: {                                                        //
//   experimentId, participantPrivateId, participantPublicId, cohortId,      //
//   stageId, chipOffer                                                      //
// }                                                                         //
// Validation: utils/src/chip.validation.ts                                  //
// ************************************************************************* //

export const sendChipOffer = onCall(async (request) => {
  const {data} = request;

  // Validate input
  const validInput = Value.Check(SendChipOfferData, data);
  if (!validInput) {
    handleSendChipOfferValidationErrors(data);
  }

  // Define chip stage public data document reference
  const publicDoc = app
    .firestore()
    .collection('experiments')
    .doc(data.experimentId)
    .collection('cohorts')
    .doc(data.cohortId)
    .collection('publicStageData')
    .doc(data.stageId);

  // Define log entry collection reference
  const logCollection = app
    .firestore()
    .collection('experiments')
    .doc(data.experimentId)
    .collection('cohorts')
    .doc(data.cohortId)
    .collection('publicStageData')
    .doc(data.stageId)
    .collection('logs');

  // Run document write as transaction to ensure consistency
  await app.firestore().runTransaction(async (transaction) => {
    const publicStageData = (
      await publicDoc.get()
    ).data() as ChipStagePublicData;
    const chipOffer = {...data.chipOffer, timestamp: Timestamp.now()};
    const currentRound = publicStageData.currentRound;

    // Set current round for chip offer
    chipOffer.round = currentRound;

    // Confirm that offer is valid (it is the participant's turn to send offers
    // and there is not already an offer)
    if (
      chipOffer.senderId !== publicStageData.currentTurn ||
      (publicStageData.participantOfferMap[currentRound] &&
        publicStageData.participantOfferMap[currentRound][chipOffer.senderId])
    ) {
      return {success: false};
    }

    // Update participant offer map in public stage data
    if (!publicStageData.participantOfferMap[currentRound]) {
      publicStageData.participantOfferMap[currentRound] = {};
    }

    publicStageData.participantOfferMap[currentRound][chipOffer.senderId] =
      createChipTransaction(chipOffer);

    // Set new public data
    transaction.set(publicDoc, publicStageData);

    // Add log entry for chip offer
    transaction.set(
      logCollection.doc(),
      createChipOfferLogEntry(chipOffer, Timestamp.now()),
    );
  });

  return {success: true};
});

// ************************************************************************* //
// sendChipResponse endpoint                                                 //
// Send true/false response to current chip offer                            //
//                                                                           //
// Input structure: {                                                        //
//   experimentId, participantPrivateId, participantPublicId, cohortId,      //
//   stageId, chipResponse                                                   //
// }                                                                         //
// Validation: utils/src/chip.validation.ts                                  //
// ************************************************************************* //
export const sendChipResponse = onCall(async (request) => {
  const {data} = request;

  // Validate input
  const validInput = Value.Check(SendChipResponseData, data);
  if (!validInput) {
    handleSendChipResponseValidationErrors(data);
  }

  // Define chip stage public data document reference
  const publicDoc = app
    .firestore()
    .collection('experiments')
    .doc(data.experimentId)
    .collection('cohorts')
    .doc(data.cohortId)
    .collection('publicStageData')
    .doc(data.stageId);

  // Run document write as transaction to ensure consistency
  await app.firestore().runTransaction(async (transaction) => {
    // Confirm that offer is valid (ID matches the current offer ID)
    const publicStageData = (
      await publicDoc.get()
    ).data() as ChipStagePublicData;
    // TODO: Check offer ID
    if (!publicStageData.currentTurn) {
      return {success: false};
    }

    // Update participant offer map in public stage data
    // (mark current participant as having responded to current offer)
    const currentRound = publicStageData.currentRound;
    const currentTurn = publicStageData.currentTurn;
    if (
      !publicStageData.participantOfferMap[currentRound] ||
      !publicStageData.participantOfferMap[currentRound][currentTurn]
    ) {
      return {success: false};
    }
    publicStageData.participantOfferMap[currentRound][currentTurn].responseMap[
      data.participantPublicId
    ] = {response: data.chipResponse, timestamp: Timestamp.now()};

    // Set new public data
    transaction.set(publicDoc, publicStageData);
  });

  return {success: true};
});

// ************************************************************************* //
// VALIDATION FUNCTIONS                                                      //
// ************************************************************************* //

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleSetChipTurnValidationErrors(data: any) {
  for (const error of Value.Errors(SetChipTurnData, data)) {
    if (isUnionError(error)) {
      const nested = checkConfigDataUnionOnPath(data, error.path);
      prettyPrintErrors(nested);
    } else {
      prettyPrintError(error);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleSendChipOfferValidationErrors(data: any) {
  for (const error of Value.Errors(SendChipOfferData, data)) {
    if (isUnionError(error)) {
      const nested = checkConfigDataUnionOnPath(data, error.path);
      prettyPrintErrors(nested);
    } else {
      prettyPrintError(error);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleSendChipResponseValidationErrors(data: any) {
  for (const error of Value.Errors(SendChipResponseData, data)) {
    if (isUnionError(error)) {
      const nested = checkConfigDataUnionOnPath(data, error.path);
      prettyPrintErrors(nested);
    } else {
      prettyPrintError(error);
    }
  }
}
