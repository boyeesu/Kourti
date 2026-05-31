/**
 * Lifecycle rules sweep.
 *
 * Runs the admin-defined lifecycle automation rules (auto-approve matching
 * signups, flag/auto-disable dormant accounts, notify on expiring trials) on a
 * schedule. Each rule's effects + audit rows are produced by the runner in
 * services/adminRules.ts; this just drives it via pg-boss like the other sweeps.
 */
import type { Job } from 'pg-boss';

import { getBoss, registerAgentHandler } from '../lib/pgboss.js';
import { runLifecycleRules } from '../services/adminRules.js';

const QUEUE_NAME = 'lifecycle_rules_sweep';

registerAgentHandler(QUEUE_NAME, async (_job: Job) => {
  const results = await runLifecycleRules();
  const total = results.reduce((n, r) => n + r.affected, 0);
  if (total > 0) {
    console.log(`[lifecycle-rules] Applied ${total} action(s) across ${results.length} rule(s)`);
  }
});

export async function startLifecycleRulesSweep() {
  const boss = getBoss();

  await boss.createQueue(QUEUE_NAME, {
    retryLimit: 2,
    retryDelay: 120,
    expireInSeconds: 600,
    deleteAfterSeconds: 3600,
  });

  // Hourly at minute 23 to avoid colliding with the other top-of-hour sweeps.
  await boss.schedule(QUEUE_NAME, '23 * * * *', {}, {});

  console.log('[lifecycle-rules] Scheduled hourly');
}
