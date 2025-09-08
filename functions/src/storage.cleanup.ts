import * as functions from 'firebase-functions';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import type {
  File,
  GetFilesOptions,
  GetFileMetadataResponse,
} from '@google-cloud/storage';
import {app} from './app';

/**
 * Purge experiment download files older than 1 day from Cloud Storage.
 * This complements signed URL expiry and avoids keeping export artifacts.
 */
export const purgeOldExperimentDownloads = onSchedule(
  {
    schedule: 'every 24 hours',
    region: 'us-central1',
    timeoutSeconds: 300,
  },
  async () => {
    const projectId =
      process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) {
      functions.logger.warn('Missing project id; skipping purge task');
      return;
    }

    const bucketName =
      process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
    const bucket = app.storage().bucket(bucketName);
    const prefix = 'downloads/experiments/';
    const cutoffMs = Date.now() - 24 * 60 * 60 * 1000; // 1 day

    let deleted = 0;
    let checked = 0;

    // Page through files under the prefix
    let query: GetFilesOptions = {prefix};
    // Loop over pages until nextQuery is undefined
    // According to @google-cloud/storage, getFiles returns [File[], nextQuery?, apiResponse]
    // where nextQuery can be passed back into getFiles.
    // We only rely on nextQuery here.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const resp = await bucket.getFiles(query);
      const files = resp[0] as File[];
      const nextQuery = (resp[1] as GetFilesOptions | undefined) || undefined;
      for (const file of files) {
        try {
          checked++;
          const metaTuple =
            (await file.getMetadata()) as GetFileMetadataResponse;
          const metadata = metaTuple[0];
          const createdIso = metadata.timeCreated;
          if (!createdIso) continue;
          const createdMs = new Date(createdIso).getTime();
          if (createdMs < cutoffMs) {
            await file.delete();
            deleted++;
          }
        } catch (err) {
          functions.logger.warn(
            `Failed processing ${file.name}: ${String(err)}`,
          );
        }
      }

      if (!nextQuery) break;
      query = nextQuery;
    }

    functions.logger.info(
      `Purge complete under ${prefix}: checked=${checked}, deleted=${deleted}`,
    );
  },
);
