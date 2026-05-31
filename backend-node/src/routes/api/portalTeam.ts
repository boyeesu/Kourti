import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { assertClientCaseAccess } from '../../services/portalAccess.js';
import { ensureClientUserForInvite } from '../../services/clientPortalAuth.js';
import { sendClientPortalInviteEmail } from '../../services/email.js';

// ════════════════════════════════════════════════════════════════════════
// portalTeamRouter — mounted at /api/v1/portal behind requireClientAuth.
//
// A client who already has ACTIVE access to a matter can invite their own
// colleagues (global identity) to view that client's matters.
//
// v1.2 CLIENT-LEVEL model: when the case has a `client_id`, a colleague is
// granted on the client (client_portal_access) and therefore sees ALL of that
// client's non-private matters with the firm — not just this one. When the
// case has NO client_id we fall back to the legacy per-matter grant
// (client_case_access).
//
// Ownership rule: a client can ONLY revoke grants that THEY made
// (granted_by === their clientUserId).  Firm-granted access (granted_by_type
// 'staff') and grants made by other colleagues are immutable from this
// surface.
// ════════════════════════════════════════════════════════════════════════

export const portalTeamRouter = Router();

// ── Param schemas ────────────────────────────────────────────────────────

const caseIdParamsSchema = z.object({
  caseId: z.string().uuid(),
});

const teamMemberParamsSchema = z.object({
  caseId: z.string().uuid(),
  clientUserId: z.string().uuid(),
});

const inviteBodySchema = z.object({
  email: z.string().email(),
  fullName: z.string().trim().min(1).optional(),
});

// ── Row type returned by team list ────────────────────────────────────────

interface TeamMemberRow {
  client_user_id: string;
  email: string;
  full_name: string | null;
  encrypted_password: string | null;
  granted_by: string | null;
}

// Minimal shape of the case context needed to resolve the access path.
interface CaseContextRow {
  client_id: string | null;
  organization_id: string;
  title: string;
  org_name: string;
}

// ── GET /matters/:caseId/team — list ACTIVE team members for this matter ──
//
//   assertClientCaseAccess guarantees the requester has an active grant.
//   v1.2: the list is the UNION of
//     • client_users with an ACTIVE client_portal_access row on the case's
//       client_id (client-level), and
//     • client_users with an ACTIVE client_case_access row for this case
//       (legacy explicit per-matter grant).
//   Per member:
//     pending       = encrypted_password is null (invite not yet accepted)
//     invitedByMe   = granted_by === requesting clientUserId

portalTeamRouter.get(
  '/matters/:caseId/team',
  asyncHandler(async (req, res) => {
    const { clientUserId } = req.clientAuth!;
    const { caseId } = caseIdParamsSchema.parse(req.params);

    // Verify the requester has active access to this matter.
    await assertClientCaseAccess(clientUserId, caseId);

    // Resolve the case's client_id so we can scope the client-level half.
    const caseResult = await db.query<{ client_id: string | null }>(
      `select client_id from public.cases where id = $1 limit 1`,
      [caseId]
    );
    const clientId = caseResult.rows[0]?.client_id ?? null;

    // UNION the client-level grants (guarded so it contributes nothing when
    // the case has no client_id) with the explicit per-matter grants.
    const result = await db.query<TeamMemberRow>(
      `
      select
        cu.id   as client_user_id,
        cu.email,
        cu.full_name,
        cu.encrypted_password,
        cpa.granted_by
      from public.client_portal_access cpa
      join public.client_users cu on cu.id = cpa.client_user_id
      where $2::uuid is not null
        and cpa.client_id = $2::uuid
        and cpa.status    = 'active'

      union

      select
        cu.id   as client_user_id,
        cu.email,
        cu.full_name,
        cu.encrypted_password,
        cca.granted_by
      from public.client_case_access cca
      join public.client_users cu on cu.id = cca.client_user_id
      where cca.case_id = $1
        and cca.status  = 'active'
      `,
      [caseId, clientId]
    );

    const members = result.rows.map((r) => ({
      clientUserId: r.client_user_id,
      email: r.email,
      fullName: r.full_name,
      pending: r.encrypted_password === null,
      invitedByMe: r.granted_by === clientUserId,
    }));

    res.status(200).json(members);
  })
);

// ── POST /matters/:caseId/team — invite a colleague ───────────────────────
//
//   1. Verify requester has active access.
//   2. Guard: cannot invite oneself.
//   3. Resolve the case's client_id + organization_id.
//   4. ensureClientUserForInvite — find-or-create the global client_user.
//   5. v1.2: if client_id is NON-NULL → upsert client-level access
//      (client_portal_access). If client_id is NULL → fall back to the
//      legacy per-matter client_case_access insert.
//   6. Best-effort invite email (swallow + log on failure).
//   7. Return the same response shape as before (the access row + pending).

portalTeamRouter.post(
  '/matters/:caseId/team',
  asyncHandler(async (req, res) => {
    const { clientUserId } = req.clientAuth!;
    const { caseId } = caseIdParamsSchema.parse(req.params);
    const { email, fullName } = inviteBodySchema.parse(req.body);

    // Verify requester has active access to this matter.
    await assertClientCaseAccess(clientUserId, caseId);

    // Fetch the requester's email to prevent self-invite.
    const selfResult = await db.query<{ email: string; full_name: string | null }>(
      `select email, full_name from public.client_users where id = $1 limit 1`,
      [clientUserId]
    );
    const self = selfResult.rows[0];
    if (!self) {
      throw new ApiError('Requesting user not found', 404, 'NOT_FOUND');
    }
    if (self.email.toLowerCase() === email.toLowerCase()) {
      throw new ApiError('You cannot invite yourself', 400, 'INVITE_SELF');
    }

    // Resolve the case's client_id + organization_id (+ context for the email).
    const ctxResult = await db.query<CaseContextRow>(
      `
      select c.client_id, c.organization_id, c.title, o.name as org_name
        from public.cases c
        join public.organizations o on o.id = c.organization_id
       where c.id = $1
       limit 1
      `,
      [caseId]
    );
    const ctx = ctxResult.rows[0];
    if (!ctx) {
      throw new ApiError('Matter not found', 404, 'NOT_FOUND');
    }

    // Find-or-create the global client_user for the invitee.
    const {
      clientUserId: newClientUserId,
      inviteToken,
      isNew,
    } = await ensureClientUserForInvite(email, fullName);

    // The response shape is identical regardless of which table backs the
    // grant: { id, clientUserId, caseId, organizationId, role, status,
    // grantedBy, createdAt, revokedAt, pending }.
    let accessRow: {
      id: string;
      client_user_id: string;
      organization_id: string;
      role: string;
      status: string;
      granted_by: string | null;
      created_at: string;
      revoked_at: string | null;
    };

    // Determine the INVITER's own access level. A colleague must never be
    // granted MORE than the inviter holds. Client-level access can only be
    // extended by someone who themselves holds client-level access on this
    // client_id; an inviter with only an explicit per-matter grant (e.g. a
    // non-client third party) may only extend that same single-matter access.
    let inviterHasClientLevel = false;
    if (ctx.client_id !== null) {
      const lvl = await db.query<{ one: number }>(
        `select 1 as one from public.client_portal_access
          where client_user_id = $1 and client_id = $2 and status = 'active'
          limit 1`,
        [clientUserId, ctx.client_id]
      );
      inviterHasClientLevel = lvl.rows.length > 0;
    }

    if (ctx.client_id !== null && inviterHasClientLevel) {
      // CLIENT-LEVEL: upsert a client_portal_access grant keyed on the
      // firm's clients.id. Re-activate a previously revoked row on conflict.
      // Only reachable when the inviter ALSO holds client-level access, so the
      // colleague never gains broader reach than the inviter.
      const upsert = await db.query<typeof accessRow>(
        `
        insert into public.client_portal_access
          (client_user_id, client_id, organization_id, role, status,
           granted_by, granted_by_type)
        values ($1, $2, $3, 'viewer', 'active', $4, 'client')
        on conflict (client_user_id, client_id)
          do update set
            status     = 'active',
            revoked_at = null
        returning id, client_user_id, organization_id,
                  role, status, granted_by, created_at, revoked_at
        `,
        [newClientUserId, ctx.client_id, ctx.organization_id, clientUserId]
      );
      accessRow = upsert.rows[0];
    } else {
      // PER-MATTER grant via client_case_access (unique on client_user_id,
      // case_id). Reached when the matter has no client contact (client_id
      // NULL) OR when the inviter only holds explicit per-matter access — in
      // both cases the colleague gets access to THIS matter only, never more
      // than the inviter.
      const insert = await db.query<typeof accessRow>(
        `
        insert into public.client_case_access
          (client_user_id, case_id, organization_id, role, status, granted_by)
        values ($1, $2, $3, 'viewer', 'active', $4)
        on conflict (client_user_id, case_id)
          do update set
            status     = 'active',
            revoked_at = null,
            granted_by = excluded.granted_by
        returning id, client_user_id, organization_id,
                  role, status, granted_by, created_at, revoked_at
        `,
        [newClientUserId, caseId, ctx.organization_id, clientUserId]
      );
      accessRow = insert.rows[0];
    }

    // Determine whether the invitee still needs to accept the invite
    // (no password set yet).  isNew is always pending; re-invites of
    // existing users may already have a password — re-check the DB.
    let pending: boolean;
    if (isNew) {
      pending = true;
    } else {
      const pwResult = await db.query<{ encrypted_password: string | null }>(
        `select encrypted_password from public.client_users where id = $1 limit 1`,
        [newClientUserId]
      );
      pending = pwResult.rows[0]?.encrypted_password === null;
    }

    // Best-effort invite email — never let a mail failure break the invite.
    try {
      await sendClientPortalInviteEmail({
        email,
        firmName: ctx.org_name,
        inviterName: self.full_name ?? undefined,
        matterTitle: ctx.title,
        inviteToken,
      });
    } catch (err) {
      console.error('[portalTeam] invite email failed', {
        to: email,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    res.status(201).json({
      id: accessRow.id,
      clientUserId: accessRow.client_user_id,
      caseId,
      organizationId: accessRow.organization_id,
      role: accessRow.role,
      status: accessRow.status,
      grantedBy: accessRow.granted_by,
      createdAt: accessRow.created_at,
      revokedAt: accessRow.revoked_at,
      pending,
    });
  })
);

// ── DELETE /matters/:caseId/team/:clientUserId — revoke a teammate ────────
//
//   Enforcement: only a grant where granted_by === requesting clientUserId
//   can be revoked here.  This prevents a client from removing:
//     • the firm's own grant (granted_by_type 'staff'), or
//     • a colleague's invitation extended by a DIFFERENT colleague.
//   v1.2: revoke across BOTH tables — the client-level grant
//   (client_portal_access for the case's client_id) AND any explicit
//   per-matter grant (client_case_access for this case). 404 if neither
//   matched — indistinguishable from "never granted", the safe posture.

portalTeamRouter.delete(
  '/matters/:caseId/team/:clientUserId',
  asyncHandler(async (req, res) => {
    const { clientUserId: requesterId } = req.clientAuth!;
    const { caseId, clientUserId: targetClientUserId } = teamMemberParamsSchema.parse(req.params);

    // Verify requester has active access to this matter.
    await assertClientCaseAccess(requesterId, caseId);

    // Resolve the case's client_id to scope the client-level revoke.
    const caseResult = await db.query<{ client_id: string | null }>(
      `select client_id from public.cases where id = $1 limit 1`,
      [caseId]
    );
    const clientId = caseResult.rows[0]?.client_id ?? null;

    // Revoke the client-level grant (only if the case has a client_id and the
    // requester made it). Guard with $1::uuid is not null so a null client_id
    // never matches an unrelated row.
    const cpaResult = await db.query<{ id: string }>(
      `
      update public.client_portal_access
         set status     = 'revoked',
             revoked_at = now()
       where $1::uuid is not null
         and client_id      = $1::uuid
         and client_user_id  = $2
         and status          = 'active'
         and granted_by      = $3
      returning id
      `,
      [clientId, targetClientUserId, requesterId]
    );

    // Revoke any explicit per-matter grant the requester made for this case.
    const ccaResult = await db.query<{ id: string }>(
      `
      update public.client_case_access
         set status     = 'revoked',
             revoked_at = now()
       where case_id         = $1
         and client_user_id  = $2
         and status          = 'active'
         and granted_by      = $3
      returning id
      `,
      [caseId, targetClientUserId, requesterId]
    );

    const revoked = (cpaResult.rowCount ?? 0) + (ccaResult.rowCount ?? 0);
    if (revoked === 0) {
      // No matching row in either table — never invited, already revoked, or
      // not the requester's invitation.  Always 404 to avoid info leakage.
      throw new ApiError('Team member not found', 404, 'NOT_FOUND');
    }

    res.status(200).json({ ok: true });
  })
);
