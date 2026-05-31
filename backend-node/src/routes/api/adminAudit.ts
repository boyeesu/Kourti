/**
 * Platform-admin RICHER AUDIT LOG module (read-only).
 *
 * Adds advanced query/inspection endpoints over public.admin_actions on top of
 * the basic GET/POST /actions that lives in admin.ts. This router OWNS the
 * `/audit/...` prefix only — it never touches `/actions` (that belongs to
 * admin.ts).
 *
 * Endpoints (all gated on the 'platform.read' capability):
 *   GET /audit/actions        — filtered + paginated list, { rows, total }
 *   GET /audit/actions/:id     — single action with full before/after state
 *   GET /audit/export.csv      — same filters, streamed as text/csv (cap 50k)
 *   GET /audit/action-types    — distinct action_type values for a dropdown
 *
 * Mount (relative paths) at /api/v1/admin behind requireAuth, e.g.:
 *   app.use('/api/v1/admin', requireAuth, adminAuditRouter);
 */
import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { asyncHandler, ApiError } from '../../lib/http.js';
import { requireAdminCapabilityFor } from '../../services/authorization.js';

export const adminAuditRouter = Router();

// ── Shared filter parsing ───────────────────────────────────────────────────

const filterSchema = z.object({
  admin_user_id: z.string().uuid().optional(),
  action_type: z.string().trim().min(1).optional(),
  target_type: z.string().trim().min(1).optional(),
  target_id: z.string().trim().min(1).optional(),
  start_date: z.string().trim().min(1).optional(),
  end_date: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).optional(),
});

type AuditFilters = z.infer<typeof filterSchema>;

/**
 * Build the parameterised WHERE clause shared by the list, count, and CSV
 * export queries. Returns the SQL fragment (incl. leading `where` or empty
 * string) plus the ordered bind values. `nextParamIndex` tells the caller the
 * next free $N so it can append LIMIT/OFFSET binds.
 */
function buildWhere(filters: AuditFilters): { whereSql: string; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (filters.admin_user_id) {
    values.push(filters.admin_user_id);
    clauses.push(`aa.admin_user_id = $${values.length}`);
  }

  if (filters.action_type) {
    // Trailing % → ILIKE prefix match; otherwise exact match.
    if (filters.action_type.endsWith('%')) {
      values.push(filters.action_type);
      clauses.push(`aa.action_type ilike $${values.length}`);
    } else {
      values.push(filters.action_type);
      clauses.push(`aa.action_type = $${values.length}`);
    }
  }

  if (filters.target_type) {
    values.push(filters.target_type);
    clauses.push(`aa.target_type = $${values.length}`);
  }

  if (filters.target_id) {
    values.push(filters.target_id);
    clauses.push(`aa.target_id = $${values.length}`);
  }

  if (filters.start_date) {
    values.push(filters.start_date);
    clauses.push(`aa.created_at >= $${values.length}`);
  }

  if (filters.end_date) {
    values.push(filters.end_date);
    clauses.push(`aa.created_at <= $${values.length}`);
  }

  if (filters.q) {
    // Free-text ILIKE across action_type / target_type / reason.
    values.push(`%${filters.q}%`);
    const i = values.length;
    clauses.push(
      `(aa.action_type ilike $${i} or aa.target_type ilike $${i} or coalesce(aa.reason,'') ilike $${i})`
    );
  }

  const whereSql = clauses.length ? `where ${clauses.join(' and ')}` : '';
  return { whereSql, values };
}

// ── GET /audit/actions ──────────────────────────────────────────────────────

const listQuerySchema = filterSchema.extend({
  limit: z.coerce.number().int().positive().max(1000).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

adminAuditRouter.get(
  '/audit/actions',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');

    const parsed = listQuerySchema.parse(req.query);
    const { limit, offset, ...filters } = parsed;
    const { whereSql, values } = buildWhere(filters);

    const listValues = [...values, limit, offset];
    const limitParam = listValues.length - 1; // $N for limit
    const offsetParam = listValues.length; // $N for offset

    const result = await db.query(
      `
      select
        aa.id,
        aa.admin_user_id,
        au.email as admin_email,
        aa.action_type,
        aa.target_type,
        aa.target_id,
        aa.details,
        aa.reason,
        aa.ip_address,
        aa.user_agent,
        aa.created_at
      from public.admin_actions aa
      left join public.auth_users au on au.id = aa.admin_user_id
      ${whereSql}
      order by aa.created_at desc
      limit $${limitParam} offset $${offsetParam}
      `,
      listValues
    );

    // Count query is defensive: never let a count failure 500 the list.
    let total = result.rows.length;
    try {
      const countResult = await db.query<{ count: string }>(
        `
        select count(*)::text as count
        from public.admin_actions aa
        ${whereSql}
        `,
        values
      );
      total = Number(countResult.rows[0]?.count ?? result.rows.length);
    } catch {
      total = result.rows.length;
    }

    res.status(200).json({ rows: result.rows, total });
  })
);

// ── GET /audit/actions/:id ──────────────────────────────────────────────────

adminAuditRouter.get(
  '/audit/actions/:id',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');

    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

    const result = await db.query(
      `
      select
        aa.id,
        aa.admin_user_id,
        au.email as admin_email,
        aa.action_type,
        aa.target_type,
        aa.target_id,
        aa.details,
        aa.reason,
        aa.before_state,
        aa.after_state,
        aa.ip_address,
        aa.user_agent,
        aa.created_at
      from public.admin_actions aa
      left join public.auth_users au on au.id = aa.admin_user_id
      where aa.id = $1
      limit 1
      `,
      [id]
    );

    if (!result.rows[0]) {
      throw new ApiError('Audit action not found', 404, 'NOT_FOUND');
    }

    res.status(200).json(result.rows[0]);
  })
);

// ── GET /audit/export.csv ───────────────────────────────────────────────────

const CSV_ROW_CAP = 50_000;

/**
 * RFC-4180-style CSV field escaping: wrap every field in double quotes and
 * double any internal double quotes. Wrapping unconditionally makes commas,
 * newlines, and leading/trailing whitespace safe without per-char inspection.
 */
function csvField(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

adminAuditRouter.get(
  '/audit/export.csv',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');

    const filters = filterSchema.parse(req.query);
    const { whereSql, values } = buildWhere(filters);

    const result = await db.query<{
      created_at: Date | string;
      admin_email: string | null;
      action_type: string;
      target_type: string;
      target_id: string | null;
      reason: string | null;
      ip_address: string | null;
    }>(
      `
      select
        aa.created_at,
        au.email as admin_email,
        aa.action_type,
        aa.target_type,
        aa.target_id,
        aa.reason,
        aa.ip_address
      from public.admin_actions aa
      left join public.auth_users au on au.id = aa.admin_user_id
      ${whereSql}
      order by aa.created_at desc
      limit ${CSV_ROW_CAP}
      `,
      values
    );

    const header = [
      'created_at',
      'admin_email',
      'action_type',
      'target_type',
      'target_id',
      'reason',
      'ip_address',
    ];

    const lines = [header.map(csvField).join(',')];
    for (const r of result.rows) {
      const created =
        r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? '');
      lines.push(
        [created, r.admin_email, r.action_type, r.target_type, r.target_id, r.reason, r.ip_address]
          .map(csvField)
          .join(',')
      );
    }

    // CRLF line endings are the safest cross-platform choice for CSV consumers.
    const csv = lines.join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
    res.status(200).send(csv);
  })
);

// ── GET /audit/action-types ─────────────────────────────────────────────────

adminAuditRouter.get(
  '/audit/action-types',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');

    const result = await db
      .query<{ action_type: string }>(
        `
        select distinct action_type
        from public.admin_actions
        where action_type is not null
        order by action_type asc
        `
      )
      .catch(() => ({ rows: [] as { action_type: string }[] }));

    res.status(200).json(result.rows.map((r) => r.action_type));
  })
);
