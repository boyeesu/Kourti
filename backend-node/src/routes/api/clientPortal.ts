import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { getBoss } from '../../lib/pgboss.js';
import { recordCaseEvent } from '../../services/caseEvents.js';
import { ensureClientUserForInvite } from '../../services/clientPortalAuth.js';
import { sendClientPortalInviteEmail, sendClientUpdateEmail } from '../../services/email.js';

// ════════════════════════════════════════════════════════════════════════
// Staff-side client-portal management router.
//
// Mounted by keystone at /api/v1/client-portal behind:
//   requireAuth, requireActiveSubscription, requireFeature('client_portal').
// So we can assume req.auth exists AND the org has the feature. Even so, EVERY
// query is scoped by req.auth.organizationId, and we verify the case belongs to
// the org before acting (defence in depth).
// ════════════════════════════════════════════════════════════════════════

export const clientPortalRouter = Router();

// ── Helpers ────────────────────────────────────────────────────────────────

const caseIdParamsSchema = z.object({ caseId: z.string().uuid() });

/** Verify the case exists and belongs to the staff member's org. Returns the
 *  case row (id, title, client_id) for downstream use. */
async function requireCaseInOrg(
  caseId: string,
  organizationId: string
): Promise<{ id: string; title: string; client_id: string | null }> {
  const result = await db.query<{ id: string; title: string; client_id: string | null }>(
    `select id, title, client_id from public.cases where id = $1 and organization_id = $2 limit 1`,
    [caseId, organizationId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError('Case not found', 404, 'NOT_FOUND');
  }
  return row;
}

// ── Schemas ──────────────────────────────────────────────────────────────

const inviteSchema = z.object({
  email: z.string().email(),
  fullName: z.string().trim().min(1).optional(),
});

const clientUserIdParamsSchema = caseIdParamsSchema.extend({
  clientUserId: z.string().uuid(),
});

const eventIdParamsSchema = caseIdParamsSchema.extend({
  eventId: z.string().uuid(),
});

const digestIdParamsSchema = z.object({ digestId: z.string().uuid() });

const toggleVisibilitySchema = z.object({
  clientVisible: z.boolean(),
});

const manualEventSchema = z.object({
  eventType: z.string().trim().min(1),
  title: z.string().trim().min(1).optional(),
  body: z.string().trim().optional(),
  clientVisible: z.boolean().optional(),
});

const summarySchema = z.object({
  clientSummary: z.string().nullable(),
});

const privateSchema = z.object({
  private: z.boolean(),
});

const portalSettingsSchema = z.object({
  requireOtp: z.boolean(),
});

// ── POST /cases/:caseId/invite ──────────────────────────────────────────────

clientPortalRouter.post(
  '/cases/:caseId/invite',
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const { caseId } = caseIdParamsSchema.parse(req.params);
    const { email, fullName } = inviteSchema.parse(req.body);

    const caseRow = await requireCaseInOrg(caseId, organizationId);

    // Find-or-create the GLOBAL client identity + a fresh 24h invite token.
    const { clientUserId, inviteToken } = await ensureClientUserForInvite(email, fullName);

    // Upsert the firm's per-org contact link to the global identity and flip
    // portal_enabled on. Match by (organization_id, lower(email)); if a contact
    // row already exists for this email in the org, link + enable it, else
    // create a minimal one.
    const clientUpsert = await db.query<{ id: string }>(
      `
      with existing as (
        select id from public.clients
         where organization_id = $1 and lower(email) = lower($2)
         limit 1
      ),
      updated as (
        update public.clients c
           set client_user_id = $3,
               portal_enabled = true,
               updated_at = now()
          from existing
         where c.id = existing.id
        returning c.id
      ),
      inserted as (
        insert into public.clients
          (name, email, status, organization_id, created_by, user_id,
           client_user_id, portal_enabled, created_at, updated_at)
        select coalesce($4, $2), $2, 'active', $1, $5, $5, $3, true, now(), now()
        where not exists (select 1 from existing)
        returning id
      )
      select id from updated
      union all
      select id from inserted
      `,
      [organizationId, email, clientUserId, fullName ?? null, userId]
    );

    const clientId = clientUpsert.rows[0]?.id ?? null;

    // Grant (or re-activate) access — CLIENT-LEVEL by default. If the matter is
    // tied to a firm client (case.client_id), upsert a client-level grant so the
    // invited client_user sees ALL of that client's matters (current + future),
    // subject to per-matter cases.portal_private. If the matter has no client
    // contact (client_id IS NULL), fall back to the legacy per-matter explicit
    // grant in client_case_access so the invite still works for that single
    // matter.
    let accessRow: unknown;
    if (caseRow.client_id) {
      const cpa = await db.query(
        `
        insert into public.client_portal_access
          (client_user_id, client_id, organization_id, role, status, granted_by, granted_by_type)
        values ($1, $2, $3, 'viewer', 'active', $4, 'staff')
        on conflict (client_user_id, client_id) do update set
          status = 'active',
          revoked_at = null
        returning *
        `,
        [clientUserId, caseRow.client_id, organizationId, userId]
      );
      accessRow = cpa.rows[0];
    } else {
      // Fall back to the per-matter explicit grant. Unique on (client_user_id, case_id).
      const cca = await db.query(
        `
        insert into public.client_case_access
          (client_user_id, case_id, organization_id, client_id, role, status, granted_by)
        values ($1, $2, $3, $4, 'viewer', 'active', $5)
        on conflict (client_user_id, case_id) do update set
          status = 'active',
          organization_id = excluded.organization_id,
          client_id = excluded.client_id,
          granted_by = excluded.granted_by,
          revoked_at = null
        returning *
        `,
        [clientUserId, caseId, organizationId, clientId, userId]
      );
      accessRow = cca.rows[0];
    }

    // Resolve the inviter's display name for the email (best-effort).
    let inviterName: string | undefined;
    let firmName = 'Your law firm';
    try {
      const [profileRes, orgRes] = await Promise.all([
        db.query<{ first_name: string | null; last_name: string | null }>(
          `select first_name, last_name from public.profiles where user_id = $1 and organization_id = $2 limit 1`,
          [userId, organizationId]
        ),
        db.query<{ name: string }>(`select name from public.organizations where id = $1 limit 1`, [
          organizationId,
        ]),
      ]);
      const p = profileRes.rows[0];
      const composed = [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim();
      inviterName = composed || undefined;
      if (orgRes.rows[0]?.name) firmName = orgRes.rows[0].name;
    } catch {
      // Non-fatal — fall back to defaults.
    }

    // Send the invite email. On failure, swallow + log; never fail the invite.
    try {
      await sendClientPortalInviteEmail({
        email,
        firmName,
        inviterName,
        matterTitle: caseRow.title,
        inviteToken,
      });
    } catch (err) {
      console.error('[client-portal] invite email failed', {
        error: err instanceof Error ? err.message : String(err),
        caseId,
        organizationId,
      });
    }

    res.status(201).json({
      grant: accessRow,
      // The client must accept the invite (verify their email) before they can
      // sign in; surface that as a pending flag for the UI.
      pending: true,
    });
  })
);

// ── GET /cases/:caseId/access — client_users with access to this case ──────

clientPortalRouter.get(
  '/cases/:caseId/access',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { caseId } = caseIdParamsSchema.parse(req.params);
    const caseRow = await requireCaseInOrg(caseId, organizationId);

    // Everyone who can see this matter = client_users with an active
    // client-level grant on the case's client_id (client_portal_access) UNION
    // client_users with an active explicit per-matter grant (client_case_access)
    // for this case. Shape is identical to before.
    const result = await db.query(
      `
      select
        cpa.id,
        cpa.client_user_id,
        cpa.role,
        cpa.status,
        cpa.granted_by,
        cpa.created_at,
        cpa.revoked_at,
        cu.email,
        cu.full_name,
        cu.last_sign_in_at,
        cu.email_verified_at
      from public.client_portal_access cpa
      join public.client_users cu on cu.id = cpa.client_user_id
      where cpa.client_id = $1
        and cpa.organization_id = $2
        and cpa.status = 'active'
        and $1::uuid is not null

      union

      select
        cca.id,
        cca.client_user_id,
        cca.role,
        cca.status,
        cca.granted_by,
        cca.created_at,
        cca.revoked_at,
        cu.email,
        cu.full_name,
        cu.last_sign_in_at,
        cu.email_verified_at
      from public.client_case_access cca
      join public.client_users cu on cu.id = cca.client_user_id
      where cca.case_id = $3
        and cca.organization_id = $2
        and cca.status = 'active'

      order by created_at desc
      `,
      [caseRow.client_id, organizationId, caseId]
    );

    res.status(200).json({ items: result.rows });
  })
);

// ── DELETE /cases/:caseId/access/:clientUserId — revoke ─────────────────────

clientPortalRouter.delete(
  '/cases/:caseId/access/:clientUserId',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { caseId, clientUserId } = clientUserIdParamsSchema.parse(req.params);
    const caseRow = await requireCaseInOrg(caseId, organizationId);

    // Revoke this client's access to this matter across BOTH paths: the
    // client-level grant for the case's client_id (client_portal_access) and any
    // explicit per-matter grant for the case (client_case_access).
    const [cpaResult, ccaResult] = await Promise.all([
      caseRow.client_id
        ? db.query(
            `
            update public.client_portal_access
               set status = 'revoked', revoked_at = now()
             where client_id = $1 and client_user_id = $2 and organization_id = $3
               and status = 'active'
             returning id, status
            `,
            [caseRow.client_id, clientUserId, organizationId]
          )
        : Promise.resolve({ rows: [] as Array<{ id: string; status: string }> }),
      db.query<{ id: string; status: string }>(
        `
        update public.client_case_access
           set status = 'revoked', revoked_at = now()
         where case_id = $1 and client_user_id = $2 and organization_id = $3
           and status = 'active'
         returning id, status
        `,
        [caseId, clientUserId, organizationId]
      ),
    ]);

    const revoked = cpaResult.rows[0] ?? ccaResult.rows[0];
    if (!revoked) {
      throw new ApiError('Access grant not found', 404, 'NOT_FOUND');
    }

    res.status(200).json(revoked);
  })
);

// ── PATCH /cases/:caseId/private — toggle per-matter portal privacy ──────────

clientPortalRouter.patch(
  '/cases/:caseId/private',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { caseId } = caseIdParamsSchema.parse(req.params);
    const { private: isPrivate } = privateSchema.parse(req.body);
    await requireCaseInOrg(caseId, organizationId);

    const result = await db.query<{ id: string; portal_private: boolean }>(
      `
      update public.cases
         set portal_private = $1, updated_at = now()
       where id = $2 and organization_id = $3
       returning id, portal_private
      `,
      [isPrivate, caseId, organizationId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Case not found', 404, 'NOT_FOUND');
    }

    res.status(200).json({
      caseId: result.rows[0].id,
      portalPrivate: result.rows[0].portal_private,
    });
  })
);

// ── GET /cases/:caseId/events — ALL events (staff view), newest first ──────

clientPortalRouter.get(
  '/cases/:caseId/events',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { caseId } = caseIdParamsSchema.parse(req.params);
    await requireCaseInOrg(caseId, organizationId);

    const result = await db.query(
      `
      select id, organization_id, case_id, event_type, title, body, payload,
             actor_type, actor_id, client_visible, notified_at, occurred_at, created_at
        from public.case_events
       where case_id = $1 and organization_id = $2
       order by occurred_at desc
      `,
      [caseId, organizationId]
    );

    res.status(200).json({ items: result.rows });
  })
);

// ── PATCH /cases/:caseId/events/:eventId — toggle visibility ────────────────

clientPortalRouter.patch(
  '/cases/:caseId/events/:eventId',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { caseId, eventId } = eventIdParamsSchema.parse(req.params);
    const { clientVisible } = toggleVisibilitySchema.parse(req.body);
    await requireCaseInOrg(caseId, organizationId);

    const result = await db.query(
      `
      update public.case_events
         set client_visible = $1
       where id = $2 and case_id = $3 and organization_id = $4
       returning id, client_visible
      `,
      [clientVisible, eventId, caseId, organizationId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Event not found', 404, 'NOT_FOUND');
    }

    res.status(200).json(result.rows[0]);
  })
);

// ── POST /cases/:caseId/events — staff posts a manual update ────────────────

clientPortalRouter.post(
  '/cases/:caseId/events',
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const { caseId } = caseIdParamsSchema.parse(req.params);
    const body = manualEventSchema.parse(req.body);
    await requireCaseInOrg(caseId, organizationId);

    await recordCaseEvent({
      organizationId,
      caseId,
      eventType: body.eventType,
      title: body.title,
      body: body.body,
      clientVisible: body.clientVisible,
      actorType: 'staff',
      actorId: userId,
    });

    res.status(201).json({ ok: true });
  })
);

// ── PATCH /cases/:caseId/summary — update cases.client_summary ──────────────

clientPortalRouter.patch(
  '/cases/:caseId/summary',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { caseId } = caseIdParamsSchema.parse(req.params);
    const { clientSummary } = summarySchema.parse(req.body);

    const result = await db.query<{ id: string; client_summary: string | null }>(
      `
      update public.cases
         set client_summary = $1, updated_at = now()
       where id = $2 and organization_id = $3
       returning id, client_summary
      `,
      [clientSummary, caseId, organizationId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Case not found', 404, 'NOT_FOUND');
    }

    res.status(200).json(result.rows[0]);
  })
);

// ── GET /cases/:caseId/digests — list digests for the case ──────────────────

clientPortalRouter.get(
  '/cases/:caseId/digests',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { caseId } = caseIdParamsSchema.parse(req.params);
    await requireCaseInOrg(caseId, organizationId);

    const result = await db.query(
      `
      select id, organization_id, case_id, client_user_id, status, channel,
             subject, body_md, event_ids, generated_by_job_id, approved_by,
             approved_at, sent_at, error, created_at
        from public.client_update_digests
       where case_id = $1 and organization_id = $2
       order by created_at desc
      `,
      [caseId, organizationId]
    );

    res.status(200).json({ items: result.rows });
  })
);

// ── POST /cases/:caseId/digests/generate — enqueue the digest agent ────────

clientPortalRouter.post(
  '/cases/:caseId/digests/generate',
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const { caseId } = caseIdParamsSchema.parse(req.params);
    await requireCaseInOrg(caseId, organizationId);

    // Create the job record, then enqueue via pg-boss. Mirrors agents.ts:
    // the job topic IS the agent_type and we pass _jobId so the worker can
    // look up the full job.
    const jobResult = await db.query<{ id: string; status: string; created_at: string }>(
      `insert into public.agent_jobs (organization_id, created_by, agent_type, input)
       values ($1, $2, 'client_update_digest', $3)
       returning id, status, created_at`,
      [organizationId, userId, JSON.stringify({ caseId })]
    );

    const job = jobResult.rows[0];

    const boss = getBoss();
    await boss.send('client_update_digest', {
      _jobId: job.id,
      caseId,
    });

    res.status(202).json({
      jobId: job.id,
      status: job.status,
      createdAt: job.created_at,
    });
  })
);

// ── POST /digests/:digestId/approve — approve + send ────────────────────────

clientPortalRouter.post(
  '/digests/:digestId/approve',
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const { digestId } = digestIdParamsSchema.parse(req.params);

    // Move draft → approved (scoped to org). Only a draft can be approved.
    const approved = await db.query<{
      id: string;
      case_id: string;
      client_user_id: string | null;
      subject: string | null;
      body_md: string | null;
      event_ids: string[];
    }>(
      `
      update public.client_update_digests
         set status = 'approved', approved_by = $1, approved_at = now()
       where id = $2 and organization_id = $3 and status = 'draft'
       returning id, case_id, client_user_id, subject, body_md, event_ids
      `,
      [userId, digestId, organizationId]
    );

    const digest = approved.rows[0];
    if (!digest) {
      throw new ApiError('Digest not found or not in draft state', 404, 'NOT_FOUND');
    }

    // Resolve recipient + firm + matter context for the email.
    const ctxRes = await db.query<{
      matter_title: string;
      firm_name: string;
      client_email: string | null;
      client_name: string | null;
    }>(
      `
      select
        c.title as matter_title,
        o.name as firm_name,
        cu.email as client_email,
        cu.full_name as client_name
      from public.cases c
      join public.organizations o on o.id = c.organization_id
      left join public.client_users cu on cu.id = $2
      where c.id = $1
      limit 1
      `,
      [digest.case_id, digest.client_user_id]
    );

    const ctx = ctxRes.rows[0];
    const recipientEmail = ctx?.client_email;

    if (!recipientEmail) {
      // No recipient to send to — mark failed so the UI can surface it.
      await db.query(
        `update public.client_update_digests
            set status = 'failed', error = $1
          where id = $2 and organization_id = $3`,
        ['No recipient email for the digest client', digestId, organizationId]
      );
      throw new ApiError('Digest has no recipient email', 422, 'NO_RECIPIENT');
    }

    try {
      await sendClientUpdateEmail({
        email: recipientEmail,
        firmName: ctx.firm_name,
        clientName: ctx.client_name ?? undefined,
        matterTitle: ctx.matter_title,
        subject: digest.subject ?? `Update on ${ctx.matter_title}`,
        bodyMarkdown: digest.body_md ?? '',
        caseId: digest.case_id,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      console.error('[client-portal] digest send failed', { error: message, digestId });
      await db.query(
        `update public.client_update_digests
            set status = 'failed', error = $1
          where id = $2 and organization_id = $3`,
        [message, digestId, organizationId]
      );
      throw new ApiError('Failed to send client update', 502, 'SEND_FAILED');
    }

    // Mark sent.
    const sent = await db.query(
      `
      update public.client_update_digests
         set status = 'sent', sent_at = now(), error = null
       where id = $1 and organization_id = $2
       returning id, status, sent_at
      `,
      [digestId, organizationId]
    );

    // Stamp notified_at on the included events so the next digest skips them.
    if (digest.event_ids.length > 0) {
      await db.query(
        `update public.case_events
            set notified_at = now()
          where id = any($1::uuid[]) and organization_id = $2`,
        [digest.event_ids, organizationId]
      );
    }

    // Best-effort timeline entry for the send (never throws).
    await recordCaseEvent({
      organizationId,
      caseId: digest.case_id,
      eventType: 'update_sent',
      title: digest.subject ?? 'Update sent to client',
      clientVisible: true,
      actorType: 'staff',
      actorId: userId,
    });

    res.status(200).json(sent.rows[0]);
  })
);

// ── POST /digests/:digestId/discard — mark failed (discarded) ───────────────

clientPortalRouter.post(
  '/digests/:digestId/discard',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { digestId } = digestIdParamsSchema.parse(req.params);

    const result = await db.query(
      `
      update public.client_update_digests
         set status = 'failed', error = coalesce(error, 'Discarded by staff')
       where id = $1 and organization_id = $2 and status in ('draft', 'approved')
       returning id, status
      `,
      [digestId, organizationId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Digest not found or already finalized', 404, 'NOT_FOUND');
    }

    res.status(200).json(result.rows[0]);
  })
);

// ════════════════════════════════════════════════════════════════════════
// Staff document sharing — Agent 4 (v1.1 ADDENDUM)
//
// GET    /cases/:caseId/documents               list case docs (all, staff view)
// POST   /cases/:caseId/documents/:documentId/share    share a doc to the client
// DELETE /cases/:caseId/documents/:documentId/share    unshare a doc
// ════════════════════════════════════════════════════════════════════════

const documentShareParamsSchema = caseIdParamsSchema.extend({
  documentId: z.string().uuid(),
});

// ── GET /cases/:caseId/documents ─────────────────────────────────────────────

clientPortalRouter.get(
  '/cases/:caseId/documents',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { caseId } = caseIdParamsSchema.parse(req.params);
    await requireCaseInOrg(caseId, organizationId);

    const result = await db.query<{
      id: string;
      name: string;
      mime_type: string | null;
      file_size: number | null;
      client_visible: boolean;
      created_at: string;
    }>(
      `
      select id, name, mime_type, file_size, client_visible, created_at
        from public.documents
       where metadata->>'case_id' = $1
         and organization_id = $2
         and deleted_at is null
       order by created_at desc
      `,
      [caseId, organizationId]
    );

    res.status(200).json({
      items: result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        mimeType: r.mime_type,
        fileSize: r.file_size,
        clientVisible: r.client_visible,
        createdAt: r.created_at,
      })),
    });
  })
);

// ── POST /cases/:caseId/documents/:documentId/share ───────────────────────────

clientPortalRouter.post(
  '/cases/:caseId/documents/:documentId/share',
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const { caseId, documentId } = documentShareParamsSchema.parse(req.params);
    await requireCaseInOrg(caseId, organizationId);

    // Verify the document belongs to this org (and isn't deleted).
    const existing = await db.query<{ id: string; name: string }>(
      `
      select id, name
        from public.documents
       where id = $1 and organization_id = $2 and deleted_at is null
       limit 1
      `,
      [documentId, organizationId]
    );

    if (!existing.rows[0]) {
      throw new ApiError('Document not found', 404, 'NOT_FOUND');
    }

    const docName = existing.rows[0].name;

    // Set client_visible = true and ensure metadata carries the case_id link.
    const updated = await db.query<{
      id: string;
      name: string;
      mime_type: string | null;
      file_size: number | null;
      client_visible: boolean;
      created_at: string;
    }>(
      `
      update public.documents
         set client_visible = true,
             metadata       = coalesce(metadata, '{}'::jsonb)
                              || jsonb_build_object('case_id', $1::text),
             updated_at     = now()
       where id = $2 and organization_id = $3 and deleted_at is null
       returning id, name, mime_type, file_size, client_visible, created_at
      `,
      [caseId, documentId, organizationId]
    );

    if (!updated.rows[0]) {
      throw new ApiError('Document not found', 404, 'NOT_FOUND');
    }

    // Best-effort event — never throws to the caller.
    await recordCaseEvent({
      organizationId,
      caseId,
      eventType: 'document_shared',
      title: docName,
      clientVisible: true,
      actorType: 'staff',
      actorId: userId,
      payload: { documentId },
    });

    const row = updated.rows[0];
    res.status(200).json({
      id: row.id,
      name: row.name,
      mimeType: row.mime_type,
      fileSize: row.file_size,
      clientVisible: row.client_visible,
      createdAt: row.created_at,
    });
  })
);

// ── DELETE /cases/:caseId/documents/:documentId/share ─────────────────────────

clientPortalRouter.delete(
  '/cases/:caseId/documents/:documentId/share',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { caseId, documentId } = documentShareParamsSchema.parse(req.params);
    await requireCaseInOrg(caseId, organizationId);

    const result = await db.query(
      `
      update public.documents
         set client_visible = false,
             updated_at     = now()
       where id = $1 and organization_id = $2 and deleted_at is null
      `,
      [documentId, organizationId]
    );

    if ((result.rowCount ?? 0) === 0) {
      throw new ApiError('Document not found', 404, 'NOT_FOUND');
    }

    res.status(204).send();
  })
);

// ════════════════════════════════════════════════════════════════════════
// Firm-wide client-portal settings — Agent 2 (v1.3 ADDENDUM)
//
// GET   /settings   read organizations.portal_require_otp for the staff's org
// PATCH /settings   {requireOtp} update it
// ════════════════════════════════════════════════════════════════════════

// ── GET /settings ────────────────────────────────────────────────────────────

clientPortalRouter.get(
  '/settings',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;

    const result = await db.query<{ portal_require_otp: boolean }>(
      `select portal_require_otp from public.organizations where id = $1 limit 1`,
      [organizationId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Organization not found', 404, 'NOT_FOUND');
    }

    res.status(200).json({ requireOtp: result.rows[0].portal_require_otp });
  })
);

// ── PATCH /settings ──────────────────────────────────────────────────────────

clientPortalRouter.patch(
  '/settings',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { requireOtp } = portalSettingsSchema.parse(req.body);

    const result = await db.query<{ portal_require_otp: boolean }>(
      `
      update public.organizations
         set portal_require_otp = $1, updated_at = now()
       where id = $2
       returning portal_require_otp
      `,
      [requireOtp, organizationId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Organization not found', 404, 'NOT_FOUND');
    }

    res.status(200).json({ requireOtp: result.rows[0].portal_require_otp });
  })
);
