import type { Job } from 'pg-boss';

import { db } from '../db/pool.js';
import { getBoss, registerAgentHandler } from '../lib/pgboss.js';
import { runContractExpirationMonitor } from './monitors/contractExpirationMonitor.js';
import { runCaseDeadlineMonitor } from './monitors/caseDeadlineMonitor.js';
import { runDocumentChangeMonitor } from './monitors/documentChangeMonitor.js';

type MonitorRunner = (
  orgId: string,
  monitorId: string,
  config: Record<string, unknown>,
  lastRunAt: string | null
) => Promise<Record<string, unknown>>;

const monitorRunners: Record<string, MonitorRunner> = {
  contract_expiration: (orgId, monitorId, config) =>
    runContractExpirationMonitor(orgId, monitorId, config),
  case_deadline: (orgId, monitorId, config) => runCaseDeadlineMonitor(orgId, monitorId, config),
  document_change: (orgId, monitorId, _config, lastRunAt) =>
    runDocumentChangeMonitor(orgId, monitorId, lastRunAt),
};

// ── Scheduler: checks for due monitors every 5 minutes ──────────────

registerAgentHandler('monitor_scheduler', async (_job: Job) => {
  // Find all enabled monitors that are due to run
  const dueMonitors = await db.query(
    `select id, organization_id, monitor_type, config, last_run_at, run_interval_minutes
     from agent_monitors
     where enabled = true
       and (next_run_at is null or next_run_at <= now())
     order by next_run_at asc nulls first
     limit 50`
  );

  const boss = getBoss();

  for (const monitor of dueMonitors.rows) {
    // Schedule individual monitor run
    await boss.send('monitor_run', {
      monitorId: monitor.id,
      organizationId: monitor.organization_id,
      monitorType: monitor.monitor_type,
      config: monitor.config,
      lastRunAt: monitor.last_run_at,
    });
  }

  console.log(`[monitor-scheduler] Scheduled ${dueMonitors.rows.length} monitor runs`);
});

// ── Runner: executes a single monitor ────────────────────────────────

registerAgentHandler('monitor_run', async (job: Job) => {
  const raw = job.data as Record<string, unknown> | undefined;
  if (
    !raw ||
    typeof raw.monitorId !== 'string' ||
    typeof raw.organizationId !== 'string' ||
    typeof raw.monitorType !== 'string'
  ) {
    console.error('[monitor] Invalid job payload, skipping:', JSON.stringify(raw)?.slice(0, 200));
    return;
  }

  const data = {
    monitorId: raw.monitorId,
    organizationId: raw.organizationId,
    monitorType: raw.monitorType,
    config: (raw.config ?? {}) as Record<string, unknown>,
    lastRunAt: (raw.lastRunAt as string) ?? null,
  };

  const runner = monitorRunners[data.monitorType];
  if (!runner) {
    console.error(`[monitor] Unknown monitor type: ${data.monitorType}`);
    return;
  }

  try {
    const result = await runner(data.organizationId, data.monitorId, data.config, data.lastRunAt);

    // Update monitor timestamps
    await db.query(
      `update agent_monitors
       set last_run_at = now(),
           next_run_at = now() + (run_interval_minutes || ' minutes')::interval,
           updated_at = now()
       where id = $1`,
      [data.monitorId]
    );

    // Write audit log
    await db.query(
      `insert into agent_audit_logs (organization_id, action, details)
       values ($1, $2, $3)`,
      [
        data.organizationId,
        'monitor_completed',
        JSON.stringify({ monitorType: data.monitorType, monitorId: data.monitorId, ...result }),
      ]
    );

    console.log(
      `[monitor] ${data.monitorType} for org ${data.organizationId.slice(0, 8)}... — ${JSON.stringify(result)}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[monitor] ${data.monitorType} failed:`, msg);

    // Still update last_run_at so we don't retry immediately
    try {
      await db.query(
        `update agent_monitors
         set last_run_at = now(),
             next_run_at = now() + (run_interval_minutes || ' minutes')::interval,
             updated_at = now()
         where id = $1`,
        [data.monitorId]
      );
      await db.query(
        `insert into agent_audit_logs (organization_id, action, details)
         values ($1, 'monitor_failed', $2)`,
        [
          data.organizationId,
          JSON.stringify({ monitorType: data.monitorType, error: msg.slice(0, 500) }),
        ]
      );
    } catch (innerErr) {
      console.error(
        '[monitor] Failed to update monitor after error:',
        innerErr instanceof Error ? innerErr.message : innerErr
      );
    }
  }
});

// ── Start the scheduler on a 5-minute cron ───────────────────────────

export async function startMonitorScheduler() {
  const boss = getBoss();

  // Create queues for monitor jobs
  await boss.createQueue('monitor_scheduler', {
    retryLimit: 1,
    expireInSeconds: 120,
    deleteAfterSeconds: 3600,
  });
  await boss.createQueue('monitor_run', {
    retryLimit: 2,
    retryDelay: 60,
    expireInSeconds: 300,
    deleteAfterSeconds: 3600,
  });

  // Schedule the meta-job to run every 5 minutes
  await boss.schedule('monitor_scheduler', '*/5 * * * *', {}, {});

  console.log('[monitor-scheduler] Scheduled every 5 minutes');
}
