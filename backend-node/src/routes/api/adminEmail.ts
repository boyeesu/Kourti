/**
 * Platform-admin EMAIL DELIVERABILITY VIEWER.
 *
 * Read-only visibility into public.email_delivery_log (what we sent via Resend
 * and the Brevo contact mirror, with status + errors) plus a 30-day stats
 * rollup, and a content.manage-gated resend action for a single logged email.
 *
 * Mounted at /api/v1/admin (relative `/email/...` paths). Read handlers gate on
 * 'platform.read'; the resend mutation gates on 'content.manage'.
 */
import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { recordAdminAction } from '../../services/adminAudit.js';
import { requireAdminCapabilityFor } from '../../services/authorization.js';
import { sendNotificationEmail } from '../../services/email.js';

export const adminEmailRouter = Router();

const PROVIDERS = ['resend', 'brevo'] as const;
const STATUSES = ['queued', 'sent', 'delivered', 'bounced', 'complained', 'failed'] as const;

// ── GET /email/log ───────────────────────────────────────────────────────────

const logQuerySchema = z.object({
  to_email: z.string().trim().min(1).optional(),
  provider: z.enum(PROVIDERS).optional(),
  status: z.enum(STATUSES).optional(),
  start_date: z.string().trim().min(1).optional(),
  end_date: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().positive().max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

adminEmailRouter.get(
  '/email/log',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');

    const filters = logQuerySchema.parse(req.query);

    const whereClauses: string[] = [];
    const values: unknown[] = [];

    if (filters.to_email) {
      values.push(`%${filters.to_email.toLowerCase()}%`);
      whereClauses.push(`to_email ilike $${values.length}`);
    }
    if (filters.provider) {
      values.push(filters.provider);
      whereClauses.push(`provider = $${values.length}`);
    }
    if (filters.status) {
      values.push(filters.status);
      whereClauses.push(`status = $${values.length}`);
    }
    if (filters.start_date) {
      values.push(filters.start_date);
      whereClauses.push(`created_at >= $${values.length}`);
    }
    if (filters.end_date) {
      values.push(filters.end_date);
      whereClauses.push(`created_at <= $${values.length}`);
    }

    const whereSql = whereClauses.length ? `where ${whereClauses.join(' and ')}` : '';

    values.push(filters.limit);
    const limitParam = `$${values.length}`;
    values.push(filters.offset);
    const offsetParam = `$${values.length}`;

    const result = await db.query(
      `
      select id, provider, to_email, subject, template, provider_message_id,
             status, error, organization_id, user_id, metadata,
             created_at, updated_at
        from public.email_delivery_log
      ${whereSql}
      order by created_at desc
      limit ${limitParam} offset ${offsetParam}
      `,
      values
    );

    res.status(200).json({
      rows: result.rows,
      limit: filters.limit,
      offset: filters.offset,
      count: result.rowCount ?? result.rows.length,
    });
  })
);

// ── GET /email/stats ─────────────────────────────────────────────────────────

adminEmailRouter.get(
  '/email/stats',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');

    const result = await db.query<{ status: string; count: string }>(
      `
      select status, count(*)::text as count
        from public.email_delivery_log
       where created_at >= now() - interval '30 days'
      group by status
      `
    );

    const byStatus: Record<string, number> = {};
    for (const s of STATUSES) byStatus[s] = 0;
    let total = 0;
    for (const row of result.rows) {
      const n = Number(row.count) || 0;
      byStatus[row.status] = n;
      total += n;
    }

    const bounced = byStatus.bounced ?? 0;
    const complained = byStatus.complained ?? 0;
    const failed = byStatus.failed ?? 0;

    const rate = (n: number) => (total > 0 ? Number(((n / total) * 100).toFixed(2)) : 0);

    res.status(200).json({
      window_days: 30,
      total,
      by_status: byStatus,
      bounce_rate: rate(bounced),
      complaint_rate: rate(complained),
      failure_rate: rate(failed),
    });
  })
);

// ── POST /email/:id/resend ───────────────────────────────────────────────────

const resendParamsSchema = z.object({ id: z.string().uuid() });
const resendBodySchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required'),
});

interface EmailLogRow {
  id: string;
  provider: string;
  to_email: string;
  subject: string | null;
  template: string | null;
  organization_id: string | null;
  user_id: string | null;
}

adminEmailRouter.post(
  '/email/:id/resend',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    await requireAdminCapabilityFor(auth.userId, 'content.manage');

    const { id } = resendParamsSchema.parse(req.params);
    const { reason } = resendBodySchema.parse(req.body ?? {});

    const lookup = await db.query<EmailLogRow>(
      `select id, provider, to_email, subject, template, organization_id, user_id
         from public.email_delivery_log
        where id = $1`,
      [id]
    );
    const row = lookup.rows[0];
    if (!row) {
      throw new ApiError('No email log entry with that id', 404, 'NOT_FOUND');
    }

    // Brevo rows are marketing contact-mirror upserts, not real outbound emails,
    // so there is nothing to "resend". Record the attempt and return 501.
    if (row.provider !== 'resend') {
      await recordAdminAction({
        adminUserId: auth.userId,
        actionType: 'email.resend',
        targetType: 'email',
        targetId: id,
        reason,
        details: { outcome: 'unsupported_provider', provider: row.provider, to: row.to_email },
        req,
      });
      throw new ApiError(
        `Resend is not supported for ${row.provider} entries (contact-sync only)`,
        501,
        'NOT_IMPLEMENTED'
      );
    }

    // Re-send a generic notification to the same recipient using the existing
    // transactional email service. This deliberately uses sendNotificationEmail
    // rather than reconstructing the original template (the original HTML/body
    // is not retained), giving a safe, predictable re-delivery.
    const subject = row.subject || 'A message from Kourti AI';
    let outcome: 'sent' | 'failed' = 'sent';
    let errorMessage: string | null = null;
    let messageId: string | undefined;

    try {
      const result = await sendNotificationEmail(
        row.to_email,
        subject,
        'This is a re-delivery of an earlier message from your legal team. ' +
          'If you have already received the original, you can safely disregard this copy.'
      );
      messageId = result.messageId;
    } catch (err) {
      outcome = 'failed';
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    await recordAdminAction({
      adminUserId: auth.userId,
      actionType: 'email.resend',
      targetType: 'email',
      targetId: id,
      reason,
      details: {
        outcome,
        provider: row.provider,
        to: row.to_email,
        original_template: row.template,
        provider_message_id: messageId ?? null,
        error: errorMessage,
      },
      req,
    });

    if (outcome === 'failed') {
      throw new ApiError(`Resend failed: ${errorMessage ?? 'unknown error'}`, 502, 'RESEND_FAILED');
    }

    res.status(200).json({
      resent: true,
      to: row.to_email,
      provider_message_id: messageId ?? null,
    });
  })
);
