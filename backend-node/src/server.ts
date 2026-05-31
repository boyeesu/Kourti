import { createServer } from 'node:http';

import { createApp } from './app.js';
import { env } from './config/env.js';
import { ensureDatabaseSchema } from './db/bootstrap.js';
import { db } from './db/pool.js';
import { startAgentWorker, stopAgentWorker } from './lib/pgboss.js';
import { hydrateRateLimits } from './lib/rateLimit.js';

// Import agents so they register their handlers before worker starts
import './agents/matterReview.js';
import './agents/clientUpdateDigest.js';
import './agents/monitorScheduler.js';
import './agents/intelligenceSynthesis.js';
import './agents/weeklyDigest.js';
import './agents/trialExpirySweep.js';
import './agents/unverifiedUserSweep.js';
import './agents/lifecycleRulesSweep.js';
import './agents/retentionSweep.js';
import { startMonitorScheduler } from './agents/monitorScheduler.js';
import { startWeeklyDigestScheduler } from './agents/weeklyDigest.js';
import { startTrialExpirySweep } from './agents/trialExpirySweep.js';
import { startUnverifiedUserSweep } from './agents/unverifiedUserSweep.js';
import { startMarketingKbScheduler } from './agents/marketingKbSync.js';
import { startLifecycleRulesSweep } from './agents/lifecycleRulesSweep.js';
import { startRetentionSweep } from './agents/retentionSweep.js';
import { purgeExpiredAuditData } from './scripts/retentionPurge.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// SOC 2 storage-limitation control: purge expired audit/security/email-log
// data once shortly after boot, then daily. Guarded so a failure never crashes
// the server (the purge itself is already best-effort per-table).
function scheduleRetentionPurge() {
  const run = () => {
    void purgeExpiredAuditData().catch((error) => {
      console.error('Retention purge failed:', error instanceof Error ? error.message : error);
    });
  };
  // First run a short delay after boot so it doesn't compete with startup work.
  setTimeout(run, 60_000).unref?.();
  setInterval(run, ONE_DAY_MS).unref?.();
}

const app = createApp();
const server = createServer(app);

async function start() {
  console.log(`Starting backend-node [${env.NODE_ENV}] on port ${env.PORT}...`);

  try {
    await ensureDatabaseSchema();
  } catch (error) {
    // Log but don't crash -- the health endpoint will report DB status
    console.error(
      'Database bootstrap failed (server will still start):',
      error instanceof Error ? error.message : error
    );
  }

  // Hydrate rate limits from DB so they survive restarts
  await hydrateRateLimits().catch(() => undefined);

  try {
    await startAgentWorker();
    await startMonitorScheduler();
    await startWeeklyDigestScheduler();
    await startTrialExpirySweep();
    await startUnverifiedUserSweep();
    await startMarketingKbScheduler();
    await startLifecycleRulesSweep();
    await startRetentionSweep();
  } catch (error) {
    console.error(
      'Agent worker startup failed (server will still start):',
      error instanceof Error ? error.message : error
    );
  }

  server.listen(env.PORT, '0.0.0.0', () => {
    console.log(`backend-node listening on 0.0.0.0:${env.PORT} [${env.NODE_ENV}]`);
    scheduleRetentionPurge();
  });
}

start().catch(async (error) => {
  console.error('Failed to start backend-node:', error instanceof Error ? error.message : error);
  await db.end().catch(() => undefined);
  process.exit(1);
});

async function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down backend-node...`);
  await stopAgentWorker();
  server.close(async () => {
    await db.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
