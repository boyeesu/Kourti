/**
 * Platform-admin SYSTEM HEALTH DASHBOARD (read-only).
 *
 * Mounted at /api/v1/admin (alongside adminRouter) so every route lives under
 * the `/system/...` prefix:
 *
 *   app.use('/api/v1/admin', requireAuth, adminHealthRouter);
 *
 * Design rules for this module:
 *   - Every section is wrapped in its own try/catch and every query carries a
 *     defensive `.catch(() => ...)`. The aggregate endpoint must NEVER 500 and
 *     must always respond 200 — a missing table/column degrades to `null` for
 *     that section rather than failing the whole dashboard.
 *   - Gated on the read-only 'platform.read' capability (support + billing +
 *     superadmin all hold it). Nothing here mutates state.
 *
 * Column facts verified against db/bootstrap.ts:
 *   - agent_jobs.status defaults to 'pending' (NOT 'queued'); type col is
 *     `agent_type`. We surface both queued+pending under "queued" for clarity.
 *   - email_delivery_log.status ∈ queued|sent|delivered|bounced|complained|failed
 *   - payment_transactions has `status`, `webhook_received_at`, `created_at`.
 *     There is no dedicated webhook log table — webhook health is derived from
 *     payment_transactions.webhook_received_at.
 *   - contact_submissions.status ∈ new|in_progress|resolved
 *   - impersonation_sessions: active === ended_at IS NULL (and not expired).
 */
import { Router } from 'express';

import { env } from '../../config/env.js';
import { db } from '../../db/pool.js';
import { asyncHandler } from '../../lib/http.js';
import { requireAdminCapabilityFor } from '../../services/authorization.js';

export const adminHealthRouter = Router();

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Run a query, returning rows or [] on ANY failure (missing table/col, etc). */
async function safeRows<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  return db
    .query<T>(sql, params)
    .then((r) => r.rows)
    .catch(() => [] as T[]);
}

/** Coerce a possibly-string count into a number. */
function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// ── GET /system/health — aggregate dashboard ────────────────────────────────

adminHealthRouter.get(
  '/system/health',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');

    // ── db: timed `select 1` ────────────────────────────────────────────────
    let dbSection: { ok: boolean; latency_ms: number | null } = { ok: false, latency_ms: null };
    try {
      const start = Date.now();
      const ok = await db
        .query('select 1 as ok')
        .then(() => true)
        .catch(() => false);
      dbSection = { ok, latency_ms: ok ? Date.now() - start : null };
    } catch {
      dbSection = { ok: false, latency_ms: null };
    }

    // ── background_jobs: agent_jobs by status (last 24h) + oldest queued age ──
    let backgroundJobs: {
      queued: number;
      running: number;
      failed: number;
      completed: number;
      other: number;
      total_24h: number;
      oldest_queued_age_seconds: number | null;
    } | null = null;
    try {
      // status values seen in code: pending (default), running, completed,
      // failed. We map pending→queued and treat anything else as `other`.
      const rows = await safeRows<{ status: string; count: string }>(
        `select status, count(*)::int as count
           from public.agent_jobs
          where created_at >= now() - interval '24 hours'
          group by status`
      );
      const oldest = await safeRows<{ age_seconds: number | null }>(
        `select extract(epoch from (now() - min(created_at)))::int as age_seconds
           from public.agent_jobs
          where status in ('queued','pending')`
      );
      if (rows.length === 0 && oldest.length === 0) {
        // Distinguish "table absent" from "table empty": probe lightly.
        const probe = await db
          .query(`select 1 from public.agent_jobs limit 1`)
          .then(() => true)
          .catch(() => false);
        backgroundJobs = probe
          ? {
              queued: 0,
              running: 0,
              failed: 0,
              completed: 0,
              other: 0,
              total_24h: 0,
              oldest_queued_age_seconds: null,
            }
          : null;
      } else {
        let queued = 0;
        let running = 0;
        let failed = 0;
        let completed = 0;
        let other = 0;
        for (const r of rows) {
          const c = num(r.count);
          switch (r.status) {
            case 'queued':
            case 'pending':
              queued += c;
              break;
            case 'running':
              running += c;
              break;
            case 'failed':
              failed += c;
              break;
            case 'completed':
              completed += c;
              break;
            default:
              other += c;
          }
        }
        backgroundJobs = {
          queued,
          running,
          failed,
          completed,
          other,
          total_24h: queued + running + failed + completed + other,
          oldest_queued_age_seconds: oldest[0]?.age_seconds ?? null,
        };
      }
    } catch {
      backgroundJobs = null;
    }

    // ── email: email_delivery_log by status (last 24h) + bounce_rate ─────────
    let email: {
      sent: number;
      delivered: number;
      bounced: number;
      complained: number;
      failed: number;
      queued: number;
      total_24h: number;
      bounce_rate: number | null;
    } | null = null;
    try {
      const rows = await safeRows<{ status: string; count: string }>(
        `select status, count(*)::int as count
           from public.email_delivery_log
          where created_at >= now() - interval '24 hours'
          group by status`
      );
      const exists = await db
        .query(`select 1 from public.email_delivery_log limit 1`)
        .then(() => true)
        .catch(() => false);
      if (!exists && rows.length === 0) {
        email = null;
      } else {
        const by: Record<string, number> = {};
        for (const r of rows) by[r.status] = num(r.count);
        const sent = by.sent ?? 0;
        const delivered = by.delivered ?? 0;
        const bounced = by.bounced ?? 0;
        const complained = by.complained ?? 0;
        const failed = by.failed ?? 0;
        const queued = by.queued ?? 0;
        const total = sent + delivered + bounced + complained + failed + queued;
        // bounce_rate = bounced / (everything that left the queue), rounded to
        // 4 dp. null when there's nothing to divide by.
        const denom = sent + delivered + bounced + complained + failed;
        email = {
          sent,
          delivered,
          bounced,
          complained,
          failed,
          queued,
          total_24h: total,
          bounce_rate: denom > 0 ? Math.round((bounced / denom) * 10000) / 10000 : null,
        };
      }
    } catch {
      email = null;
    }

    // ── payments: payment_transactions by status (last 24h) ──────────────────
    let payments: { by_status: Record<string, number>; total_24h: number } | null = null;
    try {
      const rows = await safeRows<{ status: string; count: string }>(
        `select status, count(*)::int as count
           from public.payment_transactions
          where created_at >= now() - interval '24 hours'
          group by status`
      );
      const exists = await db
        .query(`select 1 from public.payment_transactions limit 1`)
        .then(() => true)
        .catch(() => false);
      if (!exists && rows.length === 0) {
        payments = null;
      } else {
        const byStatus: Record<string, number> = {};
        let total = 0;
        for (const r of rows) {
          const c = num(r.count);
          byStatus[r.status] = c;
          total += c;
        }
        payments = { by_status: byStatus, total_24h: total };
      }
    } catch {
      payments = null;
    }

    // ── webhooks: no dedicated table — derive from payment_transactions ──────
    // We surface the most recent webhook_received_at and how many webhooks
    // landed in the last 24h. If the column/table is absent → null.
    let webhooks: {
      provider: string;
      last_received_at: string | null;
      received_24h: number;
    } | null = null;
    try {
      const rows = await safeRows<{ last_received_at: string | null; received_24h: string }>(
        `select max(webhook_received_at) as last_received_at,
                count(*) filter (
                  where webhook_received_at >= now() - interval '24 hours'
                )::int as received_24h
           from public.payment_transactions
          where webhook_received_at is not null`
      );
      const exists = await db
        .query(`select webhook_received_at from public.payment_transactions limit 1`)
        .then(() => true)
        .catch(() => false);
      webhooks = exists
        ? {
            provider: 'paystack',
            last_received_at: rows[0]?.last_received_at ?? null,
            received_24h: num(rows[0]?.received_24h),
          }
        : null;
    } catch {
      webhooks = null;
    }

    // ── impersonation: currently-active sessions ─────────────────────────────
    let impersonation: { active: number } | null = null;
    try {
      const rows = await safeRows<{ active: string }>(
        `select count(*)::int as active
           from public.impersonation_sessions
          where ended_at is null
            and expires_at > now()`
      );
      const exists = await db
        .query(`select 1 from public.impersonation_sessions limit 1`)
        .then(() => true)
        .catch(() => false);
      impersonation = exists || rows.length ? { active: num(rows[0]?.active) } : null;
    } catch {
      impersonation = null;
    }

    // ── leads: contact_submissions by status ─────────────────────────────────
    let leads: { by_status: Record<string, number>; total: number } | null = null;
    try {
      const rows = await safeRows<{ status: string; count: string }>(
        `select status, count(*)::int as count
           from public.contact_submissions
          group by status`
      );
      const exists = await db
        .query(`select 1 from public.contact_submissions limit 1`)
        .then(() => true)
        .catch(() => false);
      if (!exists && rows.length === 0) {
        leads = null;
      } else {
        const byStatus: Record<string, number> = {};
        let total = 0;
        for (const r of rows) {
          const c = num(r.count);
          byStatus[r.status] = c;
          total += c;
        }
        leads = { by_status: byStatus, total };
      }
    } catch {
      leads = null;
    }

    // ── process: uptime / memory / env ───────────────────────────────────────
    let processSection: {
      uptime_seconds: number;
      memory_rss_bytes: number;
      memory_heap_used_bytes: number;
      node_env: string;
    };
    try {
      const mem = process.memoryUsage();
      processSection = {
        uptime_seconds: Math.round(process.uptime()),
        memory_rss_bytes: mem.rss,
        memory_heap_used_bytes: mem.heapUsed,
        node_env: env.NODE_ENV,
      };
    } catch {
      processSection = {
        uptime_seconds: 0,
        memory_rss_bytes: 0,
        memory_heap_used_bytes: 0,
        node_env: env.NODE_ENV,
      };
    }

    res.status(200).json({
      generated_at: new Date().toISOString(),
      db: dbSection,
      background_jobs: backgroundJobs,
      email,
      payments,
      webhooks,
      impersonation,
      leads,
      process: processSection,
    });
  })
);

// ── GET /system/jobs — recent agent_jobs (last 50, newest first) ─────────────

adminHealthRouter.get(
  '/system/jobs',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');

    // `agent_type` is the confirmed type/kind column on agent_jobs.
    const rows = await safeRows<{
      id: string;
      status: string;
      agent_type: string | null;
      created_at: string;
      error: string | null;
    }>(
      `select id, status, agent_type, created_at, error
         from public.agent_jobs
        order by created_at desc
        limit 50`
    );

    res.status(200).json(
      rows.map((r) => ({
        id: r.id,
        status: r.status,
        type: r.agent_type,
        created_at: r.created_at,
        error: r.error ?? null,
      }))
    );
  })
);
