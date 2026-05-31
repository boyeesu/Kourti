import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { recordAdminAction } from '../../services/adminAudit.js';
import { requireAdminCapabilityFor } from '../../services/authorization.js';
import { ensureClientUserForInvite } from '../../services/clientPortalAuth.js';
import { sendClientPortalInviteEmail } from '../../services/email.js';

// ════════════════════════════════════════════════════════════════════════
// adminPortalRouter — platform-admin CLIENT PORTAL ADMIN module.
//
// Mounted by the keystone owner at /api/v1/admin (behind requireAuth), so EVERY
// path here carries the `/portal-admin` prefix to avoid colliding with the
// existing admin.ts routes. Reads authorize 'platform.read'; mutations
// authorize 'users.manage' and require a `reason` (audited via recordAdminAction
// with actionType 'client.*').
//
// The client portal uses a GLOBAL client identity (client_users) that can be
// linked to MANY firms/cases via client_case_access (per-matter) and
// client_portal_access (client-level). This module gives platform staff a
// cross-firm view + remediation tools (resend invite, merge duplicates, disable).
// ════════════════════════════════════════════════════════════════════════

export const adminPortalRouter = Router();

// ── Shared schemas ──────────────────────────────────────────────────────────

const UUID = /^[0-9a-fA-F-]{36}$/;
const idParam = z.object({ id: z.string().regex(UUID) });
const reasonField = z.string().trim().min(3);

const listQuerySchema = z.object({
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

// ── GET /portal-admin/clients — list global client identities ────────────────

adminPortalRouter.get(
  '/portal-admin/clients',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');
    const { q, limit, offset } = listQuerySchema.parse(req.query);

    const values: unknown[] = [];
    let whereSql = '';
    if (q) {
      values.push(`%${q}%`);
      whereSql = `where (cu.email ilike $${values.length} or cu.full_name ilike $${values.length})`;
    }

    // Linked-firm / linked-case counts come from BOTH access tables (per-matter
    // explicit grants and client-level grants), counting only active rows.
    values.push(limit);
    const limitIdx = values.length;
    values.push(offset);
    const offsetIdx = values.length;

    const result = await db
      .query(
        `
        select
          cu.id,
          cu.email,
          cu.full_name,
          cu.is_active,
          cu.created_at,
          (
            select count(distinct case_id)
              from public.client_case_access cca
             where cca.client_user_id = cu.id and cca.status = 'active'
          )::int as case_access_count,
          (
            select count(distinct organization_id) from (
              select organization_id from public.client_case_access
               where client_user_id = cu.id and status = 'active'
              union
              select organization_id from public.client_portal_access
               where client_user_id = cu.id and status = 'active'
            ) firms
          )::int as firm_count,
          (
            select count(distinct client_id)
              from public.client_portal_access cpa
             where cpa.client_user_id = cu.id and cpa.status = 'active'
          )::int as client_level_count
        from public.client_users cu
        ${whereSql}
        order by cu.created_at desc
        limit $${limitIdx} offset $${offsetIdx}
        `,
        values
      )
      .catch(() => ({ rows: [] }));

    res.status(200).json({ items: result.rows, limit, offset });
  })
);

// ── GET /portal-admin/clients/:id — one client (profile + links + portal) ────

adminPortalRouter.get(
  '/portal-admin/clients/:id',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');
    const { id } = idParam.parse(req.params);

    const profileRes = await db
      .query(
        `
        select id, email, full_name, phone, is_active, email_verified_at,
               last_sign_in_at, invite_token is not null as has_pending_invite,
               invite_expires_at, encrypted_password is not null as has_password,
               created_at, updated_at
          from public.client_users
         where id = $1
         limit 1
        `,
        [id]
      )
      .catch(() => ({ rows: [] }));

    const client = profileRes.rows[0];
    if (!client) {
      throw new ApiError('Client not found', 404, 'NOT_FOUND');
    }

    // Per-matter explicit access links (client_case_access → cases → orgs).
    const caseLinksRes = await db
      .query(
        `
        select
          cca.id,
          cca.case_id,
          cca.organization_id,
          cca.client_id,
          cca.role,
          cca.status,
          cca.granted_by,
          cca.created_at,
          cca.revoked_at,
          c.title       as case_title,
          o.name        as organization_name,
          'case'        as access_kind
        from public.client_case_access cca
        left join public.cases c on c.id = cca.case_id
        left join public.organizations o on o.id = cca.organization_id
        where cca.client_user_id = $1
        order by cca.created_at desc
        `,
        [id]
      )
      .catch(() => ({ rows: [] }));

    // Client-level access links (client_portal_access → clients → orgs).
    const clientLevelRes = await db
      .query(
        `
        select
          cpa.id,
          cpa.client_id,
          cpa.organization_id,
          cpa.role,
          cpa.status,
          cpa.granted_by,
          cpa.granted_by_type,
          cpa.created_at,
          cpa.revoked_at,
          cl.name as client_name,
          o.name  as organization_name,
          'client_level' as access_kind
        from public.client_portal_access cpa
        left join public.clients cl on cl.id = cpa.client_id
        left join public.organizations o on o.id = cpa.organization_id
        where cpa.client_user_id = $1
        order by cpa.created_at desc
        `,
        [id]
      )
      .catch(() => ({ rows: [] }));

    // Firm contact rows that link to this global identity (portal access status).
    const contactsRes = await db
      .query(
        `
        select cl.id, cl.organization_id, cl.name, cl.email, cl.portal_enabled,
               o.name as organization_name
          from public.clients cl
          left join public.organizations o on o.id = cl.organization_id
         where cl.client_user_id = $1
         order by cl.created_at desc
        `,
        [id]
      )
      .catch(() => ({ rows: [] }));

    res.status(200).json({
      client,
      caseLinks: caseLinksRes.rows,
      clientLevelLinks: clientLevelRes.rows,
      firmContacts: contactsRes.rows,
    });
  })
);

// ── GET /portal-admin/clients/:id/links — firms/cases (multi-firm view) ──────

adminPortalRouter.get(
  '/portal-admin/clients/:id/links',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');
    const { id } = idParam.parse(req.params);

    const exists = await db
      .query('select 1 from public.client_users where id = $1 limit 1', [id])
      .catch(() => ({ rows: [] }));
    if (!exists.rows[0]) {
      throw new ApiError('Client not found', 404, 'NOT_FOUND');
    }

    // One row per (firm, kind) the client is linked to, with how many active
    // matters back it. Drives the multi-firm grouping UI.
    const result = await db
      .query(
        `
        with case_firms as (
          select organization_id, count(distinct case_id)::int as case_count
            from public.client_case_access
           where client_user_id = $1 and status = 'active'
           group by organization_id
        ),
        client_firms as (
          select organization_id, count(distinct client_id)::int as client_count
            from public.client_portal_access
           where client_user_id = $1 and status = 'active'
           group by organization_id
        ),
        firms as (
          select organization_id from case_firms
          union
          select organization_id from client_firms
        )
        select
          f.organization_id,
          o.name as organization_name,
          coalesce(cf.case_count, 0)   as explicit_case_count,
          coalesce(clf.client_count, 0) as client_level_count
        from firms f
        left join public.organizations o on o.id = f.organization_id
        left join case_firms cf on cf.organization_id = f.organization_id
        left join client_firms clf on clf.organization_id = f.organization_id
        order by o.name nulls last
        `,
        [id]
      )
      .catch(() => ({ rows: [] }));

    res.status(200).json({ items: result.rows });
  })
);

// ── POST /portal-admin/clients/:id/resend-invite ─────────────────────────────

const resendSchema = z.object({ reason: reasonField });

adminPortalRouter.post(
  '/portal-admin/clients/:id/resend-invite',
  asyncHandler(async (req, res) => {
    const adminId = req.auth!.userId;
    await requireAdminCapabilityFor(adminId, 'users.manage');
    const { id } = idParam.parse(req.params);
    const { reason } = resendSchema.parse(req.body);

    const clientRes = await db.query<{
      id: string;
      email: string;
      full_name: string | null;
      encrypted_password: string | null;
    }>(
      `select id, email, full_name, encrypted_password
         from public.client_users where id = $1 limit 1`,
      [id]
    );
    const client = clientRes.rows[0];
    if (!client) {
      throw new ApiError('Client not found', 404, 'NOT_FOUND');
    }

    // Already-accepted accounts (password set) don't need an invite re-issued;
    // record the attempt for the trail and tell the caller why we declined.
    if (client.encrypted_password) {
      await recordAdminAction({
        adminUserId: adminId,
        actionType: 'client.resend_invite',
        targetType: 'client_user',
        targetId: id,
        reason,
        details: { outcome: 'skipped', why: 'already_accepted' },
        req,
      });
      throw new ApiError(
        'This client has already accepted their invite (password set).',
        409,
        'ALREADY_ACCEPTED'
      );
    }

    // Re-issue a fresh 24h invite token using the EXISTING invite function so
    // the token shape + expiry match the staff invite flow exactly.
    const { inviteToken } = await ensureClientUserForInvite(
      client.email,
      client.full_name ?? undefined
    );

    // Pick the most relevant firm + matter to label the invite email with. A
    // global identity can span firms; use the most recent active per-matter
    // grant, falling back to a client-level grant's firm.
    const ctxRes = await db
      .query<{ firm_name: string | null; matter_title: string | null }>(
        `
        select o.name as firm_name, c.title as matter_title
          from public.client_case_access cca
          left join public.cases c on c.id = cca.case_id
          left join public.organizations o on o.id = cca.organization_id
         where cca.client_user_id = $1 and cca.status = 'active'
         order by cca.created_at desc
         limit 1
        `,
        [id]
      )
      .catch(() => ({
        rows: [] as Array<{ firm_name: string | null; matter_title: string | null }>,
      }));

    let firmName = ctxRes.rows[0]?.firm_name ?? 'Your law firm';
    const matterTitle = ctxRes.rows[0]?.matter_title ?? 'your matter';

    if (!ctxRes.rows[0]) {
      const cpaCtx = await db
        .query<{ firm_name: string | null }>(
          `
          select o.name as firm_name
            from public.client_portal_access cpa
            left join public.organizations o on o.id = cpa.organization_id
           where cpa.client_user_id = $1 and cpa.status = 'active'
           order by cpa.created_at desc
           limit 1
          `,
          [id]
        )
        .catch(() => ({ rows: [] as Array<{ firm_name: string | null }> }));
      if (cpaCtx.rows[0]?.firm_name) firmName = cpaCtx.rows[0].firm_name;
    }

    let emailSent = false;
    let emailError: string | null = null;
    try {
      await sendClientPortalInviteEmail({
        email: client.email,
        firmName,
        matterTitle,
        inviteToken,
      });
      emailSent = true;
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
      console.error('[admin-portal] resend invite email failed', {
        clientUserId: id,
        error: emailError,
      });
    }

    await recordAdminAction({
      adminUserId: adminId,
      actionType: 'client.resend_invite',
      targetType: 'client_user',
      targetId: id,
      reason,
      after: { emailSent, firmName, matterTitle },
      details: { emailSent, emailError },
      req,
    });

    res.status(200).json({ ok: true, emailSent, emailError });
  })
);

// ── POST /portal-admin/clients/merge ─────────────────────────────────────────

const mergeSchema = z.object({
  primaryId: z.string().regex(UUID),
  duplicateId: z.string().regex(UUID),
  reason: reasonField,
});

adminPortalRouter.post(
  '/portal-admin/clients/merge',
  asyncHandler(async (req, res) => {
    const adminId = req.auth!.userId;
    await requireAdminCapabilityFor(adminId, 'users.manage');
    const { primaryId, duplicateId, reason } = mergeSchema.parse(req.body);

    if (primaryId === duplicateId) {
      throw new ApiError('primaryId and duplicateId must differ', 400, 'INVALID_MERGE');
    }

    // Both identities must exist.
    const idsRes = await db.query<{ id: string }>(
      'select id from public.client_users where id = any($1::uuid[])',
      [[primaryId, duplicateId]]
    );
    const found = new Set(idsRes.rows.map((r) => r.id));
    if (!found.has(primaryId) || !found.has(duplicateId)) {
      throw new ApiError('Both client identities must exist', 404, 'NOT_FOUND');
    }

    const client = await db.connect();
    let movedCaseAccess = 0;
    let movedClientAccess = 0;
    let duplicateDisposition: 'disabled' | 'deleted' = 'deleted';

    try {
      await client.query('begin');

      // before-counts for the audit trail.
      const beforeRes = await client.query<{
        dup_case: string;
        dup_client: string;
        dup_contacts: string;
      }>(
        `
        select
          (select count(*) from public.client_case_access where client_user_id = $1)::text as dup_case,
          (select count(*) from public.client_portal_access where client_user_id = $1)::text as dup_client,
          (select count(*) from public.clients where client_user_id = $1)::text as dup_contacts
        `,
        [duplicateId]
      );

      // 1) Re-point per-matter grants. Unique is (client_user_id, case_id), so
      //    skip rows that would collide with a grant the primary already holds.
      const ccaMoved = await client.query(
        `
        update public.client_case_access dup
           set client_user_id = $1
         where dup.client_user_id = $2
           and not exists (
             select 1 from public.client_case_access keep
              where keep.client_user_id = $1 and keep.case_id = dup.case_id
           )
        `,
        [primaryId, duplicateId]
      );
      movedCaseAccess = ccaMoved.rowCount ?? 0;

      // 2) Re-point client-level grants. Unique is (client_user_id, client_id);
      //    skip collisions the same way.
      const cpaMoved = await client.query(
        `
        update public.client_portal_access dup
           set client_user_id = $1
         where dup.client_user_id = $2
           and not exists (
             select 1 from public.client_portal_access keep
              where keep.client_user_id = $1 and keep.client_id = dup.client_id
           )
        `,
        [primaryId, duplicateId]
      );
      movedClientAccess = cpaMoved.rowCount ?? 0;

      // 3) Re-point firm contact rows (clients.client_user_id) to the primary.
      //    No unique constraint on this column, so move them all.
      await client.query(
        `update public.clients set client_user_id = $1, updated_at = now()
          where client_user_id = $2`,
        [primaryId, duplicateId]
      );

      // 4) Re-point digests so history follows the surviving identity.
      await client
        .query(
          `update public.client_update_digests set client_user_id = $1
            where client_user_id = $2`,
          [primaryId, duplicateId]
        )
        .catch(() => undefined);

      // 5) Dispose of the duplicate. Prefer a soft-disable (is_active=false +
      //    burn tokens) so the row — and any FK references we couldn't re-point
      //    (e.g. a colliding access grant left behind) — survives. The
      //    client_users table has no merged_into/status column, so is_active is
      //    the disabled marker.
      const disabled = await client.query<{ id: string }>(
        `update public.client_users
            set is_active = false,
                refresh_token = null,
                refresh_token_expires_at = null,
                invite_token = null,
                invite_expires_at = null,
                password_reset_token = null,
                password_reset_expires_at = null,
                updated_at = now()
          where id = $1
          returning id`,
        [duplicateId]
      );
      duplicateDisposition = disabled.rows[0] ? 'disabled' : 'deleted';

      // Revoke any access grants that stayed on the duplicate because they
      // collided with the primary's existing grants (defence: the duplicate is
      // now disabled, so leaving these active would be confusing).
      await client.query(
        `update public.client_case_access set status = 'revoked', revoked_at = now()
          where client_user_id = $1 and status = 'active'`,
        [duplicateId]
      );
      await client.query(
        `update public.client_portal_access set status = 'revoked', revoked_at = now()
          where client_user_id = $1 and status = 'active'`,
        [duplicateId]
      );

      await client.query('commit');

      await recordAdminAction({
        adminUserId: adminId,
        actionType: 'client.merge',
        targetType: 'client_user',
        targetId: primaryId,
        reason,
        before: {
          duplicateId,
          dupCaseAccess: Number(beforeRes.rows[0]?.dup_case ?? 0),
          dupClientAccess: Number(beforeRes.rows[0]?.dup_client ?? 0),
          dupContacts: Number(beforeRes.rows[0]?.dup_contacts ?? 0),
        },
        after: {
          primaryId,
          movedCaseAccess,
          movedClientAccess,
          duplicateDisposition,
        },
        details: { duplicateId },
        req,
      });
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    res.status(200).json({
      ok: true,
      primaryId,
      duplicateId,
      movedCaseAccess,
      movedClientAccess,
      duplicateDisposition,
    });
  })
);

// ── POST /portal-admin/clients/:id/disable ───────────────────────────────────

const disableSchema = z.object({ reason: reasonField });

adminPortalRouter.post(
  '/portal-admin/clients/:id/disable',
  asyncHandler(async (req, res) => {
    const adminId = req.auth!.userId;
    await requireAdminCapabilityFor(adminId, 'users.manage');
    const { id } = idParam.parse(req.params);
    const { reason } = disableSchema.parse(req.body);

    const before = await db.query<{ is_active: boolean }>(
      'select is_active from public.client_users where id = $1 limit 1',
      [id]
    );
    if (!before.rows[0]) {
      throw new ApiError('Client not found', 404, 'NOT_FOUND');
    }

    // Disable the global identity: is_active=false + burn session/invite/reset
    // tokens so existing sessions can't refresh. (client_users has no status
    // column; is_active is the canonical enabled/disabled flag.)
    const result = await db.query<{ id: string; is_active: boolean }>(
      `update public.client_users
          set is_active = false,
              refresh_token = null,
              refresh_token_expires_at = null,
              invite_token = null,
              invite_expires_at = null,
              password_reset_token = null,
              password_reset_expires_at = null,
              updated_at = now()
        where id = $1
        returning id, is_active`,
      [id]
    );

    await recordAdminAction({
      adminUserId: adminId,
      actionType: 'client.disable',
      targetType: 'client_user',
      targetId: id,
      reason,
      before: { is_active: before.rows[0].is_active },
      after: { is_active: false },
      req,
    });

    res.status(200).json(result.rows[0]);
  })
);
