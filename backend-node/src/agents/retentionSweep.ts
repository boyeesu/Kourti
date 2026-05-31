/**
 * Retention sweep (GDPR Art. 5(1)(e) storage limitation, NDPR).
 *
 * Enforces the schedule in docs/compliance/RETENTION_POLICY.md by purging /
 * anonymizing data past its retention window. Each window is configurable via
 * RETENTION_* env vars; set one to 0 to disable that sweep.
 *
 * Runs daily. Every step is independent and best-effort — a failure in one
 * (e.g. a table that doesn't exist on this deployment) never blocks the others.
 */
import type { Job } from 'pg-boss';

import { env } from '../config/env.js';
import { db } from '../db/pool.js';
import { getBoss, registerAgentHandler } from '../lib/pgboss.js';
import { deleteFile } from '../services/storage.js';

const QUEUE_NAME = 'retention_sweep';

async function purge(label: string, sql: string, params: unknown[]): Promise<void> {
  try {
    const res = await db.query(sql, params);
    if (res.rowCount && res.rowCount > 0) {
      console.log(`[retention] ${label}: ${res.rowCount} row(s)`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/does not exist/i.test(msg)) console.error(`[retention] ${label} failed: ${msg}`);
  }
}

registerAgentHandler(QUEUE_NAME, async (_job: Job) => {
  // 1) Expired/used OTP codes.
  if (env.RETENTION_OTP_HOURS > 0) {
    const sql = (t: string) =>
      `delete from public.${t} where created_at < now() - ($1 || ' hours')::interval`;
    await purge('email_otp_codes', sql('email_otp_codes'), [env.RETENTION_OTP_HOURS]);
    await purge('client_email_otp_codes', sql('client_email_otp_codes'), [env.RETENTION_OTP_HOURS]);
  }

  // 2) Email delivery log.
  if (env.RETENTION_EMAIL_LOG_DAYS > 0) {
    await purge(
      'email_delivery_log',
      `delete from public.email_delivery_log where created_at < now() - ($1 || ' days')::interval`,
      [env.RETENTION_EMAIL_LOG_DAYS]
    );
  }

  // 3) Idle AI conversations (and their messages via cascade / explicit delete).
  if (env.RETENTION_AI_CONVERSATION_DAYS > 0) {
    await purge(
      'ai_conversation_messages',
      `delete from public.ai_conversation_messages where conversation_id in (
         select id from public.ai_conversations where updated_at < now() - ($1 || ' days')::interval)`,
      [env.RETENTION_AI_CONVERSATION_DAYS]
    );
    await purge(
      'ai_conversations',
      `delete from public.ai_conversations where updated_at < now() - ($1 || ' days')::interval`,
      [env.RETENTION_AI_CONVERSATION_DAYS]
    );
  }

  // 4) Stale marketing leads who never converted.
  if (env.RETENTION_CONTACT_SUBMISSION_DAYS > 0) {
    await purge(
      'contact_submissions',
      `delete from public.contact_submissions where created_at < now() - ($1 || ' days')::interval`,
      [env.RETENTION_CONTACT_SUBMISSION_DAYS]
    );
  }

  // 5) Audit logs (legal-hold note: extend the window or exclude held records).
  if (env.RETENTION_AUDIT_LOG_DAYS > 0) {
    await purge(
      'admin_actions',
      `delete from public.admin_actions where created_at < now() - ($1 || ' days')::interval`,
      [env.RETENTION_AUDIT_LOG_DAYS]
    );
    await purge(
      'agent_audit_logs',
      `delete from public.agent_audit_logs where created_at < now() - ($1 || ' days')::interval`,
      [env.RETENTION_AUDIT_LOG_DAYS]
    );
    await purge(
      'security_events',
      `delete from public.security_events where created_at < now() - ($1 || ' days')::interval`,
      [env.RETENTION_AUDIT_LOG_DAYS]
    );
  }

  // 6) Expired rate-limit rows.
  if (env.RETENTION_RATE_LIMIT_DAYS > 0) {
    await purge(
      'rate_limits',
      `delete from public.rate_limits where reset_at < now() - ($1 || ' days')::interval`,
      [env.RETENTION_RATE_LIMIT_DAYS]
    );
  }

  // 7) Hard-delete soft-deleted documents past the grace window (incl. the
  //    stored file, not just the row).
  if (env.RETENTION_DELETED_DOC_GRACE_DAYS > 0) {
    try {
      const stale = await db.query<{ id: string; file_path: string | null }>(
        `select id, file_path from public.documents
          where deleted_at is not null
            and deleted_at < now() - ($1 || ' days')::interval
          limit 500`,
        [env.RETENTION_DELETED_DOC_GRACE_DAYS]
      );
      for (const row of stale.rows) {
        // Remove the stored object first so we never leak bytes for a dropped row.
        if (row.file_path) {
          await deleteFile('documents', row.file_path).catch((err) =>
            console.error(
              '[retention] doc file delete failed:',
              err instanceof Error ? err.message : err
            )
          );
        }
      }
      if (stale.rows.length) {
        await db.query(`delete from public.documents where id = any($1::uuid[])`, [
          stale.rows.map((r) => r.id),
        ]);
        console.log(`[retention] documents: ${stale.rows.length} hard-deleted`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/does not exist/i.test(msg)) console.error('[retention] document sweep failed:', msg);
    }
  }
});

export async function startRetentionSweep() {
  const boss = getBoss();
  await boss.createQueue(QUEUE_NAME, {
    retryLimit: 1,
    retryDelay: 300,
    expireInSeconds: 600,
    deleteAfterSeconds: 3600,
  });
  await boss.schedule(QUEUE_NAME, env.RETENTION_SWEEP_CRON, {}, {});
  console.log(`[retention] Scheduled (${env.RETENTION_SWEEP_CRON})`);
}
