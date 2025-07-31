import * as admin from 'firebase-admin';
import {handleAutomaticTransfer} from './participant.utils';

import {v4 as uuidv4} from 'uuid';
import {FIREBASE_CONFIG} from '../../frontend/firebase_config';
import {
  MultipleChoiceSurveyAnswer,
  ParticipantProfileExtended,
  ParticipantStatus,
  SurveyAnswer,
  SurveyQuestionKind,
  TransferStageConfig,
} from '@deliberation-lab/utils';

const PROJECT_ID = FIREBASE_CONFIG.projectId;
let firestore: admin.firestore.Firestore;

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  process.env.GOOGLE_CLOUD_PROJECT = PROJECT_ID;
  process.env.GCLOUD_PROJECT = PROJECT_ID;
  if (admin.apps.length === 0) {
    admin.initializeApp({projectId: PROJECT_ID});
  }
  firestore = admin.firestore();
});

// skipped so it doesn't run by default, since this is a long-running test.
xdescribe('handleAutomaticTransfer integration (emulator)', () => {
  const runs = 20;
  for (const runIdx of Array.from({length: runs}).keys()) {
    it(`performs concurrent transfers w/o races, and with balanced cohort assignment (run ${runIdx + 1})`, async () => {
      // Setup: create experiment, stage, and participants
      const experimentId = uuidv4();
      const cohortId = uuidv4();
      const stageId = 'transfer-stage';
      const surveyStageId = 'survey-stage';
      const surveyQuestionId = 'q1';
      const participantCount = 50;
      const answerChoices = ['A', 'B'];
      // Create experiment doc
      await firestore
        .collection('experiments')
        .doc(experimentId)
        .set({
          metadata: {
            creator: 'test',
            dateCreated: new Date(),
            dateModified: new Date(),
          },
        });
      // Create cohort doc
      await firestore
        .collection('experiments')
        .doc(experimentId)
        .collection('cohorts')
        .doc(cohortId)
        .set({
          id: 'lobby',
          stageUnlockMap: {},
        });
      // Create stage config
      await firestore
        .collection('experiments')
        .doc(experimentId)
        .collection('stages')
        .doc(stageId)
        .set({
          id: stageId,
          surveyStageId,
          surveyQuestionId,
          participantCounts: {A: 1, B: 1},
          conditionProbabilities: {control: 1 / 3, static: 1 / 3, bot: 1 / 3},
          progress: {minParticipants: 2, waitForAllParticipants: false},
        });
      // Create survey public data
      const participantAnswerMap: Record<
        string,
        Record<string, MultipleChoiceSurveyAnswer>
      > = {};
      const participants: ParticipantProfileExtended[] = [];
      for (let i = 0; i < participantCount; i++) {
        const publicId = `p${i}`;
        const privateId = uuidv4();
        const answer = answerChoices[i % answerChoices.length];
        participantAnswerMap[publicId] = {
          [surveyQuestionId]: {
            id: `q_${i}`,
            kind: SurveyQuestionKind.MULTIPLE_CHOICE,
            choiceId: answer,
          },
        };
        const participant: ParticipantProfileExtended = {
          publicId,
          privateId,
          currentStageId: stageId,
          currentStatus: ParticipantStatus.IN_PROGRESS,
          currentCohortId: cohortId,
          transferCohortId: null,
          connected: true,
          timestamps: {
            readyStages: {[stageId]: admin.firestore.Timestamp.now()},
            startExperiment: admin.firestore.Timestamp.now(),
            acceptedTOS: null,
            endExperiment: null,
            completedStages: {},
            cohortTransfers: {},
          },
          agentConfig: null,
          prolificId: null,
          anonymousProfiles: {},
          pronouns: null,
          avatar: null,
          name: null,
        };
        participants.push(participant);
        await firestore
          .collection('experiments')
          .doc(experimentId)
          .collection('participants')
          .doc(privateId)
          .set(participant);
      }
      await firestore
        .collection('experiments')
        .doc(experimentId)
        .collection('cohorts')
        .doc(cohortId)
        .collection('publicStageData')
        .doc(surveyStageId)
        .set({
          participantAnswerMap,
        });
      // Run concurrent transfers
      const runTransfer = async (participant: ParticipantProfileExtended) => {
        const maxRetries = 3;
        let lastErr;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            return await firestore.runTransaction(async (transaction) => {
              const stageConfigSnap = await transaction.get(
                firestore
                  .collection('experiments')
                  .doc(experimentId)
                  .collection('stages')
                  .doc(stageId),
              );
              const stageConfig = stageConfigSnap.data() as TransferStageConfig;
              if (!stageConfig) throw new Error('Stage config not found');
              return await handleAutomaticTransfer(
                transaction,
                experimentId,
                stageConfig,
                participant,
              );
            });
          } catch (err) {
            lastErr = err as Error;
            if (attempt < maxRetries) {
              console.log(
                `Retrying transaction for participant ${participant.publicId}, attempt ${attempt + 1}: ${lastErr.message}`,
              );
              // Sleep for 0.1 seconds before retrying
              await new Promise((res) => setTimeout(res, 100));
            } else {
              console.error(
                `Transaction failed for participant ${participant.publicId} after ${maxRetries} attempts:`,
                lastErr,
              );
            }
          }
        }
        // If we get here, all retries failed
        throw lastErr;
      };

      // Run in groups of 10
      const groupSize = 10;
      for (let i = 0; i < participants.length; i += groupSize) {
        const group = participants.slice(i, i + groupSize);
        await Promise.all(group.map(runTransfer));
        // Sleep for 0.1 seconds between groups
        await new Promise((res) => setTimeout(res, 100));
      }
      // Check that all participants have been assigned to a cohort
      const updatedSnaps = await firestore
        .collection('experiments')
        .doc(experimentId)
        .collection('participants')
        .get();
      const updated = updatedSnaps.docs.map((doc) => doc.data());
      const assigned = updated.filter((p) => p.transferCohortId !== null);
      expect(assigned.length).toBe(participantCount);
      // Check for duplicate assignments
      const cohortAssignments: Record<string, number> = {};
      for (const p of assigned) {
        console.log(
          `Participant ${p.publicId} assigned to cohort ${p.transferCohortId}`,
        );
        cohortAssignments[p.transferCohortId] =
          (cohortAssignments[p.transferCohortId] || 0) + 1;
      }
      // Each cohort should have requiredCount participants

      for (const count of Object.values(cohortAssignments)) {
        expect(count).toBe(2);
      }

      // Check that the count of classes stored on experimentalCondition (on the cohort) are approximately balanced
      const cohortSnaps = await firestore
        .collection('experiments')
        .doc(experimentId)
        .collection('cohorts')
        .get();
      const conditionCounts: Record<string, number> = {};
      for (const doc of cohortSnaps.docs) {
        const data = doc.data();
        const cond = data.experimentalCondition;
        if (!cond) continue; // skip lobby cohort
        conditionCounts[cond] = (conditionCounts[cond] || 0) + 1;
      }
      console.log('Experimental condition counts:', conditionCounts);

      // There are 3 conditions, so each should be close to total/3
      // Use normal approximation for 95% confidence interval
      const numConditions = 3;
      const n = Object.values(conditionCounts).reduce((a, b) => a + b, 0);
      const p = 1 / numConditions;
      const expected = n * p;
      const stddev = Math.sqrt(n * p * (1 - p));
      const z = 1.96; // 95% confidence
      const lower = Math.floor(expected - z * stddev);
      const upper = Math.ceil(expected + z * stddev);

      console.log(
        `Expected: ${expected}, Stddev: ${stddev}, Lower: ${lower}, Upper: ${upper}`,
      );

      for (const cond of Object.keys(conditionCounts)) {
        expect(conditionCounts[cond]).toBeGreaterThanOrEqual(lower);
        expect(conditionCounts[cond]).toBeLessThanOrEqual(upper);
      }

      // delete experiment (successful tests only)
      await firestore.collection('experiments').doc(experimentId).delete();
    }, 90000);
  }
});
