/**
 * Audit-data retention purge (SOC 2 storage-limitation control).
 *
 * Deletes audit/security/email-log rows older than RETENTION_AUDIT_LOG_DAYS
 * (see config/env.ts and docs/compliance/RETENTION_POLICY.md). Without this,
 * these tables grow unbounded and retain personal data past its lawful window.
 *
 * Scheduled from server.ts (once shortly after boot, then daily). Every table
 * is purged independently and best-effort — a failure on one table (or a table
 * absent on this deployment) never blocks the others and never throws fatally.
 */
import { env } from '../config/env.js';
import { db } from '../db/pool.js';

// Each entry purges by its own timestamp column. All three audit tables in
// bootstrap.ts record their creation time in `created_at`.
const PURGE_TARGETS: { table: string; timestampColumn: string }[] = [
  { table: 'admin_actions', timestampColumn: 'created_at' },
  { table: 'security_events', timestampColumn: 'created_at' },
  { table: 'email_delivery_log', timestampColumn: 'created_at' },
];

export async function purgeExpiredAuditData(): Promise<{ table: string; deleted: number }[]> {
  const retentionDays = env.RETENTION_AUDIT_LOG_DAYS;
  const results: { table: string; deleted: number }[] = [];

  // A retention of 0 disables the purge (keep everything).
  if (!retentionDays || retentionDays <= 0) {
    console.log('[retention-purge] RETENTION_AUDIT_LOG_DAYS=0 — purge disabled');
    return results;
  }

  for (const { table, timestampColumn } of PURGE_TARGETS) {
    try {
      const res = await db.query(
        `delete from public.${table}
         where ${timestampColumn} < now() - ($1 || ' days')::interval`,
        [retentionDays]
      );
      const deleted = res.rowCount ?? 0;
      results.push({ table, deleted });
      if (deleted > 0) {
        console.log(
          `[retention-purge] ${table}: deleted ${deleted} row(s) older than ${retentionDays}d`
        );
      }
    } catch (err) {
      // Best-effort: log and continue. Never let one table abort the run.
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ table, deleted: 0 });
      console.error(`[retention-purge] ${table} failed: ${msg}`);
    }
  }

  const total = results.reduce((sum, r) => sum + r.deleted, 0);
  console.log(
    `[retention-purge] complete — ${total} row(s) purged across ${PURGE_TARGETS.length} table(s) (retention ${retentionDays}d)`
  );
  return results;
}
