/**
 * Platform-admin MARKETING LEADS VIEWER.
 *
 * Read-only visibility into public.contact_submissions — the marketing-site
 * lead capture table that holds maturity-assessment submissions (source =
 * 'assessment', scores/answers in `metadata`), Q1 report download leads
 * (interest = 'report-download'), and plain contact-form enquiries — plus a
 * stats rollup, a filtered CSV export, and a content.manage-gated status
 * change for lead triage (new → in_progress → resolved).
 *
 * Mounted at /api/v1/admin (relative `/leads/...` paths). Read handlers gate
 * on 'platform.read'; the status mutation gates on 'content.manage'.
 */
import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { recordAdminAction } from '../../services/adminAudit.js';
import { requireAdminCapabilityFor } from '../../services/authorization.js';

export const adminLeadsRouter = Router();

const LEAD_STATUSES = ['new', 'in_progress', 'resolved'] as const;

// Logical lead types the admin UI filters by. They map onto how the public
// endpoints tag rows: assessments set source='assessment'; the Q1 report
// download form posts through /public/contact with interest='report-download';
// everything else is a plain contact enquiry.
const LEAD_TYPES = ['assessment', 'report', 'contact'] as const;

// ── Shared filter parsing ────────────────────────────────────────────────────

const filterSchema = z.object({
  q: z.string().trim().min(1).optional(),
  type: z.enum(LEAD_TYPES).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  // NOT z.coerce.boolean(): that coerces the query string "false" to true.
  marketing_consent: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  start_date: z.string().trim().min(1).optional(),
  end_date: z.string().trim().min(1).optional(),
});

type LeadFilters = z.infer<typeof filterSchema>;

function typeClause(type: (typeof LEAD_TYPES)[number]): string {
  switch (type) {
    case 'assessment':
      return `source = 'assessment'`;
    case 'report':
      return `interest = 'report-download'`;
    case 'contact':
      return `source <> 'assessment' and interest <> 'report-download'`;
  }
}

function buildWhere(filters: LeadFilters): { whereSql: string; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (filters.q) {
    values.push(`%${filters.q.toLowerCase()}%`);
    const p = `$${values.length}`;
    clauses.push(
      `(email ilike ${p} or first_name ilike ${p} or last_name ilike ${p} or company ilike ${p})`
    );
  }
  if (filters.type) {
    clauses.push(typeClause(filters.type));
  }
  if (filters.status) {
    values.push(filters.status);
    clauses.push(`status = $${values.length}`);
  }
  if (filters.marketing_consent !== undefined) {
    values.push(filters.marketing_consent);
    clauses.push(`marketing_consent = $${values.length}`);
  }
  if (filters.start_date) {
    values.push(filters.start_date);
    clauses.push(`created_at >= $${values.length}`);
  }
  if (filters.end_date) {
    values.push(filters.end_date);
    clauses.push(`created_at <= $${values.length}`);
  }

  return { whereSql: clauses.length ? `where ${clauses.join(' and ')}` : '', values };
}

// Derive the logical type in SQL so rows are self-describing for the UI/CSV.
const LEAD_TYPE_SQL = `
  case
    when source = 'assessment' then 'assessment'
    when interest = 'report-download' then 'report'
    else 'contact'
  end as lead_type`;

// ── GET /leads ───────────────────────────────────────────────────────────────

const listQuerySchema = filterSchema.extend({
  limit: z.coerce.number().int().positive().max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

adminLeadsRouter.get(
  '/leads',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');

    const { limit, offset, ...filters } = listQuerySchema.parse(req.query);
    const { whereSql, values } = buildWhere(filters);

    values.push(limit);
    const limitParam = `$${values.length}`;
    values.push(offset);
    const offsetParam = `$${values.length}`;

    const result = await db.query(
      `
      select id, first_name, last_name, email, company, phone, firm_size,
             interest, message, source, metadata, status, marketing_consent,
             created_at, ${LEAD_TYPE_SQL},
             count(*) over()::int as total_count
        from public.contact_submissions
      ${whereSql}
      order by created_at desc
      limit ${limitParam} offset ${offsetParam}
      `,
      values
    );

    const total = result.rows.length > 0 ? Number(result.rows[0].total_count) : 0;
    const rows = result.rows.map((row) => {
      const { total_count, ...rest } = row as Record<string, unknown>;
      void total_count;
      return rest;
    });

    res.status(200).json({ rows, total, limit, offset });
  })
);

// ── GET /leads/stats ─────────────────────────────────────────────────────────

adminLeadsRouter.get(
  '/leads/stats',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');

    const result = await db.query<{
      lead_type: string;
      total: string;
      last_30d: string;
      new_count: string;
      consented: string;
    }>(
      `
      select ${LEAD_TYPE_SQL},
             count(*)::text as total,
             count(*) filter (where created_at >= now() - interval '30 days')::text as last_30d,
             count(*) filter (where status = 'new')::text as new_count,
             count(*) filter (where marketing_consent)::text as consented
        from public.contact_submissions
      group by 1
      `
    );

    const empty = { total: 0, last_30d: 0, new: 0, consented: 0 };
    const byType: Record<string, typeof empty> = {
      assessment: { ...empty },
      report: { ...empty },
      contact: { ...empty },
    };
    const overall = { ...empty };
    for (const row of result.rows) {
      const bucket = byType[row.lead_type] ?? (byType[row.lead_type] = { ...empty });
      bucket.total = Number(row.total) || 0;
      bucket.last_30d = Number(row.last_30d) || 0;
      bucket.new = Number(row.new_count) || 0;
      bucket.consented = Number(row.consented) || 0;
      overall.total += bucket.total;
      overall.last_30d += bucket.last_30d;
      overall.new += bucket.new;
      overall.consented += bucket.consented;
    }

    res.status(200).json({ overall, by_type: byType });
  })
);

// ── GET /leads/export.csv ────────────────────────────────────────────────────

const CSV_ROW_CAP = 50_000;

/**
 * RFC-4180-style CSV field escaping (same approach as the audit export): wrap
 * every field in double quotes, double internal quotes, and neutralize CSV
 * formula injection (CWE-1236) — these rows are entirely visitor-supplied.
 */
function csvField(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

adminLeadsRouter.get(
  '/leads/export.csv',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');

    const filters = filterSchema.parse(req.query);
    const { whereSql, values } = buildWhere(filters);

    const result = await db.query(
      `
      select created_at, first_name, last_name, email, company, phone,
             firm_size, interest, message, status, marketing_consent,
             metadata, ${LEAD_TYPE_SQL}
        from public.contact_submissions
      ${whereSql}
      order by created_at desc
      limit ${CSV_ROW_CAP}
      `,
      values
    );

    const header = [
      'created_at',
      'type',
      'first_name',
      'last_name',
      'email',
      'company',
      'phone',
      'firm_size',
      'interest',
      'status',
      'marketing_consent',
      'assessment_tier',
      'assessment_score',
      'message',
    ];
    const lines = [header.map(csvField).join(',')];
    for (const row of result.rows) {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const score =
        meta.totalScore !== undefined && meta.maxScore !== undefined
          ? `${meta.totalScore}/${meta.maxScore}`
          : '';
      lines.push(
        [
          row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
          row.lead_type,
          row.first_name,
          row.last_name,
          row.email,
          row.company,
          row.phone,
          row.firm_size,
          row.interest,
          row.status,
          row.marketing_consent,
          meta.tier ?? '',
          score,
          row.message,
        ]
          .map(csvField)
          .join(',')
      );
    }

    res
      .status(200)
      .type('text/csv')
      .setHeader('Content-Disposition', 'attachment; filename="marketing-leads.csv"')
      .send(lines.join('\r\n'));
  })
);

// ── PATCH /leads/:id/status ──────────────────────────────────────────────────

const statusParamsSchema = z.object({ id: z.string().uuid() });
const statusBodySchema = z.object({ status: z.enum(LEAD_STATUSES) });

adminLeadsRouter.patch(
  '/leads/:id/status',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    await requireAdminCapabilityFor(auth.userId, 'content.manage');

    const { id } = statusParamsSchema.parse(req.params);
    const { status } = statusBodySchema.parse(req.body ?? {});

    const result = await db.query<{ id: string; email: string; prior_status: string }>(
      `
      with prior as (
        select status from public.contact_submissions where id = $1
      )
      update public.contact_submissions cs
         set status = $2
       where cs.id = $1
      returning cs.id, cs.email, (select status from prior) as prior_status
      `,
      [id, status]
    );
    const row = result.rows[0];
    if (!row) {
      throw new ApiError('No lead with that id', 404, 'NOT_FOUND');
    }

    await recordAdminAction({
      adminUserId: auth.userId,
      actionType: 'lead.status_change',
      targetType: 'contact_submission',
      targetId: id,
      details: { email: row.email, from: row.prior_status, to: status },
      req,
    });

    res.status(200).json({ id, status });
  })
);
