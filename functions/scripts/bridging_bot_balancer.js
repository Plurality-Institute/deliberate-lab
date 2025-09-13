#!/usr/bin/env node
/**
 * List active participants in the lobby and classify them as pro-life or pro-choice.
 * Optionally, balance Prolific recruitment by pausing/unpausing studies based on the
 * lobby's transfer queue composition.
 *
 * Usage:
 *   npm --prefix functions run balance -- [flags] <experimentId> <prolifeStudyId> <prochoiceStudyId>
 * or from repo root (after we add a root script):
 *   npm run balance -- [flags] <experimentId> <prolifeStudyId> <prochoiceStudyId>
 *
 * Flags:
 *   --project <gcp-project-id>    Set Firebase project id
 *   --dry-run                     Print planned Prolific actions but don't call API
 *   --unpause-window <seconds>    How long to unpause pro-choice (default 15)
 *   --small-threshold <n>         "Small" pro-choice queue threshold (default 2)
 *   --token <api-token>           Prolific API token; else PROLIFIC_API_TOKEN env; else .prolific_token file
 *   --loop                         Keep running: poll every 30s, or 60s after a pro-choice unpause
 *   --shutdown                     Graceful shutdown mode: recruit until balanced, then pause both studies
 */

/*
To authenticate for firebase, either:

1) Use gcloud CLI to login and set project:
  gcloud auth application-default login
  export GOOGLE_CLOUD_PROJECT=<your-gcp-project-id>
  npm run balance -- --project <your-gcp-project-id> <experimentId> <prolifeStudyId> <prochoiceStudyId>

2) Or use a service account key file:
  export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
  export GCLOUD_PROJECT=<your-gcp-project-id>   # or GOOGLE_CLOUD_PROJECT
  npm run balance -- --project <your-gcp-project-id> <experimentId> <prolifeStudyId> <prochoiceStudyId>

3) Or connect to the Firestore emulator (for testing):
  export FIRESTORE_EMULATOR_HOST=localhost:8080
  export GCLOUD_PROJECT=demo-project        # any non-empty id is fine for emulator
  npm run balance -- --project demo-project <experimentId> <prolifeStudyId> <prochoiceStudyId>

To get a Prolific API token:
  1. Open your prolific account
  2. Click API Tokens under the upper-right account menu dropdown
  3. Click "Create API Token", and give the new token a name
  4. Copy the token value

  Once you have a token, put it in a .prolific_token file in the top-level repo directory,
  or export PROLIFIC_API_TOKEN, or pass with --token.
*/

/* Contract
 * inputs: experimentId, prolifeStudyId, prochoiceStudyId (strings)
 * output: prints lines: privateId publicId cohortId status source label
 * error modes: missing args, auth/permissions, no lobby cohort
 */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

function usageAndExit() {
  console.error('Usage: npm run balance -- [--project <gcp-project-id>] [--dry-run] [--unpause-window <sec>] [--small-threshold <n>] [--shutdown] [--token <api-token>] <experimentId> <prolifeStudyId> <prochoiceStudyId>');
  process.exit(1);
}

async function main() {
  // Parse args: first three non-flag args are required; support optional --project <id>
  const rawArgs = process.argv.slice(2);
  const positional = [];
  let projectIdArg = null;
  let dryRun = false;
  let unpauseWindowSec = 15;
  let smallThreshold = 2;
  let prolificTokenArg = null;
  let loopMode = false;
  let shutdownMode = false;
  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a === '--project' && i + 1 < rawArgs.length) {
      projectIdArg = rawArgs[++i];
      continue;
    }
    if (a === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (a === '--loop') {
      loopMode = true;
      continue;
    }
    if (a === '--shutdown') {
      shutdownMode = true;
      continue;
    }
    if (a === '--unpause-window' && i + 1 < rawArgs.length) {
      unpauseWindowSec = parseInt(rawArgs[++i], 10) || 15;
      continue;
    }
    if (a === '--small-threshold' && i + 1 < rawArgs.length) {
      smallThreshold = parseInt(rawArgs[++i], 10) || 2;
      continue;
    }
    if (a === '--token' && i + 1 < rawArgs.length) {
      prolificTokenArg = rawArgs[++i];
      continue;
    }
    if (a.startsWith('--')) continue;
    positional.push(a);
  }

  const [experimentId, prolifeStudyId, prochoiceStudyId] = positional;
  if (!experimentId || !prolifeStudyId || !prochoiceStudyId) {
    usageAndExit();
    return;
  }

  // Initialize Firebase Admin SDK if not already initialized
  try {
    admin.app();
  } catch (_e) {
    const projectId = projectIdArg || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || null;
    const initOptions = {};
    // Use ADC if available
    try {
      initOptions.credential = admin.credential.applicationDefault();
    } catch (_ignored) {
      // Will fall back to no explicit credential; service account env or default metadata may be used
    }
    if (projectId) {
      initOptions.projectId = projectId;
    }
    admin.initializeApp(initOptions);
  }
  const db = admin.firestore();

  // Helper delay
  const delay = (ms) => new Promise((res) => setTimeout(res, ms));

  // One iteration of balance logic; returns true if we actually unpaused pro-choice this iteration (not dry-run)
  const doOneIteration = async () => {
    // Find transfer stage ids for the experiment
    const stagesSnap = await db
      .collection('experiments')
      .doc(experimentId)
      .collection('stages')
      .get();
    const transferStageIds = new Set();
    stagesSnap.forEach((doc) => {
      const s = doc.data() || {};
      if ((s.kind && String(s.kind).toUpperCase() === 'TRANSFER') || (doc.id && doc.id.toLowerCase().includes('transfer'))) {
        transferStageIds.add(doc.id);
      }
    });

    // Helper: fetch all cohorts and find one that looks like a lobby
    const cohortsSnap = await db
      .collection('experiments')
      .doc(experimentId)
      .collection('cohorts')
      .get();

    let lobbyCohortId = null;
    cohortsSnap.forEach((doc) => {
      const data = doc.data();
      // Heuristics: prefer id 'lobby', else name/publicName containing 'lobby'
      if (doc.id === 'lobby') lobbyCohortId = doc.id;
      if (!lobbyCohortId) {
        const meta = data && data.metadata;
        const name = meta && (meta.name || meta.publicName || '');
        if (typeof name === 'string' && name.toLowerCase().includes('lobby')) {
          lobbyCohortId = doc.id;
        }
      }
    });

    if (!lobbyCohortId) {
      console.error('Could not find a lobby cohort. Ensure there is a cohort with id or name containing "lobby".');
      if (loopMode) return false; // don't crash loop
      process.exit(2);
    }

    // Query participants in experiment who are currently in the lobby cohort and active (not disconnected)
    const participantsSnap = await db
      .collection('experiments')
      .doc(experimentId)
      .collection('participants')
      .get();

  const ParticipantStatus = {
    ATTENTION_CHECK: 'ATTENTION_CHECK',
    IN_PROGRESS: 'IN_PROGRESS',
    SUCCESS: 'SUCCESS',
    TRANSFER_PENDING: 'TRANSFER_PENDING',
    TRANSFER_TIMEOUT: 'TRANSFER_TIMEOUT',
    TRANSFER_FAIL: 'TRANSFER_FAIL',
    TRANSFER_DECLINED: 'TRANSFER_DECLINED',
    ATTENTION_TIMEOUT: 'ATTENTION_FAIL',
    BOOTED_OUT: 'BOOTED_OUT',
    DELETED: 'DELETED',
  };

  const activeInLobby = [];

  participantsSnap.forEach((doc) => {
    const p = doc.data();
    if (!p) return;
    if (p.currentCohortId !== lobbyCohortId) return;

    // Active means: connected === true (or null for legacy) and status is IN_PROGRESS or ATTENTION_CHECK or SUCCESS
    const connected = p.connected === null || p.connected === undefined ? true : !!p.connected;
    const status = p.currentStatus;
    const isActive =
      connected && (status === ParticipantStatus.IN_PROGRESS || status === ParticipantStatus.ATTENTION_CHECK || status === ParticipantStatus.SUCCESS);

    if (!isActive) return;

    // Ignore participants with a pending transfer (already assigned to a transfer cohort)
    if (p.transferCohortId) return;

    activeInLobby.push({
      privateId: doc.id,
      publicId: p.publicId,
      currentCohortId: p.currentCohortId,
      prolificId: p.prolificId || null,
      studyId: p.studyId || null,
      currentStatus: status,
      currentStageId: p.currentStageId,
      transferCohortId: p.transferCohortId || null,
      connected: !!connected,
      });
    });

  // For classification, prefer sorting hat survey answer if available, else fall back to Prolific study id
  // The sorting hat question id and stage ids come from the Bridging Bot game:
  const SORTING_HAT_QUESTION_ID = 'abortion_policy_preference';
  const POSSIBLE_STAGE_IDS = ['pre_chat_survey', 'reproductive_rights_survey_pre'];

  async function getSortingHatChoice(privateId) {
    for (const stageId of POSSIBLE_STAGE_IDS) {
      const ansDoc = await db
        .collection('experiments')
        .doc(experimentId)
        .collection('participants')
        .doc(privateId)
        .collection('stageData')
        .doc(stageId)
        .get();
      if (!ansDoc.exists) continue;
      const data = ansDoc.data();
      if (!data || !data.answerMap) continue;
  const ans = data.answerMap[SORTING_HAT_QUESTION_ID];
  if (ans && (ans.kind === 'mc' || ans.kind === 'multiple_choice') && ans.choiceId) {
        return ans.choiceId; // 'legal' or 'illegal'
      }
      // legacy casing support
      if (ans && ans.kind && String(ans.kind).toLowerCase().includes('multiple')) {
        return ans.choiceId;
      }
    }
    return null;
  }

  function classifyByStudyId(studyId) {
    if (!studyId) return null;
    if (studyId === prolifeStudyId) return 'prolife';
    if (studyId === prochoiceStudyId) return 'prochoice';
    return null;
  }

  // Fetch answers sequentially to keep simple; list is small in practice. Could batch if needed.
  const results = [];
  for (const p of activeInLobby) {
    let label = null;
    let source = null;

    const hat = await getSortingHatChoice(p.privateId);
    if (hat) {
      if (hat === 'illegal') {
        label = 'prolife';
      } else if (hat === 'legal') {
        label = 'prochoice';
      }
      if (label) source = 'sorting-hat';
    }

    if (!label) {
      const byStudy = classifyByStudyId(p.studyId);
      if (byStudy) {
        label = byStudy;
        source = 'study-id';
      }
    }

    results.push({ ...p, label: label || 'unknown', source: source || 'unknown' });
  }

  // Print summary of classifications instead of per-participant lines
  const prolifeCount = results.filter((r) => r.label === 'prolife').length;
  const prochoiceCount = results.filter((r) => r.label === 'prochoice').length;
  const unknownCount = results.filter((r) => r.label === 'unknown').length;
  console.log(`[balance] summary total=${results.length} prolife=${prolifeCount} prochoice=${prochoiceCount} unknown=${unknownCount}`);

  // Compute queue: participants waiting for transfer (connected, in transfer stage, IN_PROGRESS, no transfer assigned)
  const waiting = results.filter(
  (r) =>
    r.connected &&
    r.currentStatus === ParticipantStatus.IN_PROGRESS &&
    transferStageIds.has(r.currentStageId) &&
    !r.transferCohortId,
  );
  const prolifeWaiting = waiting.filter((r) => r.label === 'prolife').length;
  const prochoiceWaiting = waiting.filter((r) => r.label === 'prochoice').length;

  // Load Prolific token
  const prolificToken =
    prolificTokenArg || process.env.PROLIFIC_API_TOKEN || (await readTokenFromFiles());

  // Minimal Prolific API client using global fetch (Node >= 18)
  async function prolificGetStudy(id) {
    const res = await fetch(`https://api.prolific.com/api/v1/studies/${encodeURIComponent(id)}/`, {
      headers: { Authorization: `Token ${prolificToken}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`Prolific GET study ${id} failed: ${res.status} ${await res.text()}`);
    return await res.json();
  }
  async function prolificTransition(id, action) {
    const res = await fetch(`https://api.prolific.com/api/v1/studies/${encodeURIComponent(id)}/transition/`, {
      method: 'POST',
      headers: { Authorization: `Token ${prolificToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) throw new Error(`Prolific transition ${action} ${id} failed: ${res.status} ${await res.text()}`);
    return await res.json();
  }
  async function ensureStudyState(id, desired /* 'ACTIVE' | 'PAUSED' */) {
    if (dryRun) {
      console.log(`[balance] (dry-run) would ensure study ${id} is ${desired}`);
      return { changed: false, status: desired };
    }
    const st = await prolificGetStudy(id);
    const current = st.status;
    if (current === desired) return { changed: false, status: current };
    if (desired === 'ACTIVE') {
      await prolificTransition(id, 'START');
      return { changed: true, status: 'ACTIVE' };
    } else if (desired === 'PAUSED') {
      await prolificTransition(id, 'PAUSE');
      return { changed: true, status: 'PAUSED' };
    }
    return { changed: false, status: current };
  }

  // Decide actions based on queue, with defaults:
  // - Default: pro-life ACTIVE, pro-choice PAUSED
  // - If pro-life waiting and pro-choice fewer than pro-life, START pro-choice for a short window then PAUSE
  // - If no one waiting (or only a small number of pro-choice <= smallThreshold), keep default
  // - If >5 pro-choice waiting, PAUSE pro-life
  const actionsSummary = { prolifeWaiting, prochoiceWaiting, unpauseWindowSec, smallThreshold, dryRun };
  console.error(`[balance] waiting: prolife=${prolifeWaiting}, prochoice=${prochoiceWaiting}`);

  // Safety: only attempt Prolific control if we have a token, unless dry-run
  if (!prolificToken && !dryRun) {
  console.error('[balance] No Prolific token provided (use --token or PROLIFIC_API_TOKEN or .prolific_token). Skipping Prolific controls.');
    return false;
  }

  // Shutdown mode overrides defaults: drive toward equal waiting queues, then pause both
  if (shutdownMode) {
    console.error('[balance] Shutdown mode enabled: aiming for equal waiting queues, then pausing both studies.');
    if (prolifeCount === prochoiceCount) {
      console.error('[balance] Balanced participant set detected → pausing both studies.');
      await ensureStudyState(prolifeStudyId, 'PAUSED');
      await ensureStudyState(prochoiceStudyId, 'PAUSED');
      if (loopMode) {
        if (activeInLobby.length === 0) {
          console.error('[balance] Lobby cleared and both studies paused. Exiting. Don\'t forget to lock the Lobby cohort!');
          process.exit(0);
        } else {
          console.error(`[balance] Balanced but lobby not empty (active=${activeInLobby.length}). Keeping both paused and continuing.`);
        }
      }
      return false;
    }
  }

  // Rule 3: If >5 pro-life waiting, pause pro-life (leave pro-choice unchanged)
  if (prolifeWaiting > 5) {
  actionsSummary.rule = 'prolife_backlog';
  console.error('[balance] Rule: pro-life backlog > 5 → pause pro-life');
  await ensureStudyState(prolifeStudyId, 'PAUSED');
    return false;
  }

  // Rule 1: If pro-life waiting and not enough pro-choice to match, briefly unpause pro-choice
  if (prolifeWaiting > 0 && prochoiceCount < prolifeCount) {
  actionsSummary.rule = 'boost_prochoice_window';
  console.error('[balance] Rule: pro-life waiting without matching pro-choice → start pro-choice briefly');
  await ensureStudyState(prochoiceStudyId, 'ACTIVE');
  await delay(unpauseWindowSec * 1000);
  await ensureStudyState(prochoiceStudyId, 'PAUSED');

  // Keep pro-life active
  await ensureStudyState(prolifeStudyId, 'ACTIVE');
    return !dryRun; // boosted only if actually unpaused
  }

  // Rule 2: If nobody waiting, or only small pro-choice, keep default (pro-life active, pro-choice paused)
  if (prolifeWaiting === 0 && prochoiceWaiting <= smallThreshold) {
  actionsSummary.rule = 'default_idle';
  console.error('[balance] Rule: idle or small pro-choice only → pro-life ACTIVE, pro-choice PAUSED');
  await ensureStudyState(prolifeStudyId, 'ACTIVE');
  await ensureStudyState(prochoiceStudyId, 'PAUSED');
    return false;
  }

  // Otherwise, maintain default unless already matched/overmatched by pro-choice
  actionsSummary.rule = 'default';
  console.error('[balance] Rule: default → pro-life ACTIVE, pro-choice PAUSED');
  await ensureStudyState(prolifeStudyId, 'ACTIVE');
  await ensureStudyState(prochoiceStudyId, 'PAUSED');
    return false;
  };

  if (!loopMode) {
    await doOneIteration();
  } else {
    console.error('[balance] Loop mode enabled: checking every 30s (60s after a pro-choice unpause). Press Ctrl-C to stop.');
    while (true) {
      const boosted = await doOneIteration();
      const nextSec = boosted ? 60 : 30;
      console.error(`[balance] Sleeping ${nextSec}s...`);
      await delay(nextSec * 1000);
    }
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(3);
});

async function readTokenFromFiles() {
  // Try top-level repo .prolific_token, then current dir
  const candidates = [
    path.resolve(process.cwd(), '..', '.prolific_token'),
    path.resolve(process.cwd(), '.prolific_token'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const t = fs.readFileSync(p, 'utf8').trim();
        if (t) return t;
      }
    } catch (_e) {}
  }
  return null;
}
