import {
  createLogEntry,
  createLlmCallLog,
  LlmCallLog,
} from '@deliberation-lab/utils';

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import {Timestamp} from 'firebase-admin/firestore';

import {app} from './app';

/** Write log for cohort. */
export async function writeLogEntry(
  experimentId: string,
  cohortId: string,
  stageId: string,
  participantId: string, // public ID
  summary: string,
  trace: string,
) {
  const log = createLogEntry({
    experimentId,
    cohortId,
    stageId,
    participantId,
    summary,
    trace,
    timestamp: Timestamp.now(),
  });

  const logDoc = await app
    .firestore()
    .collection('experiments')
    .doc(experimentId)
    .collection('logs')
    .doc(log.id);

  await app.firestore().runTransaction(async (transaction) => {
    transaction.set(logDoc, log);
  });
}

/** Write LLM call log outside of any transaction.
 * This allows us to log LLM calls even if the transaction is rejected.
 */
export async function writeLlmCallLog(log: LlmCallLog) {
  const logDoc = app
    .firestore()
    .collection('experiments')
    .doc(log.experimentId)
    .collection('llmLogs')
    .doc(log.id);

  // Write directly without transaction
  await logDoc.set(log);
}
