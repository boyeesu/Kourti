import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { checkRateLimit } from '../../lib/rateLimit.js';
import { ensureClientUserForInvite } from '../../services/clientPortalAuth.js';
import { sendClientPortalInviteEmail } from '../../services/email.js';

// ════════════════════════════════════════════════════════════════════════
// portalPeopleRouter — mounted at /api/v1/portal behind requireClientAuth.
//
// ORG-LEVEL colleague management: a client can invite/revoke colleagues for
// every firm/client where THEY hold active client_portal_access (client-level
// identity, not per-matter). Mirrors portalTeam.ts but keyed on
// client_portal_access.client_id rather than a specific case.
// ════════════════════════════════════════════════════════════════════════

export const portalPeopleRouter = Router();

// ── Param / body schemas ──────────────────────────────────────────────────

const clientUserIdParamsSchema = z.object({ clientUserId: z.string().uuid() });

const inviteBodySchema = z.object({
  clientId: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string().trim().min(1).optional(),
});

const clientIdQuerySchema = z.object({ clientId: z.string().uuid() });

// ── GET /people — list all colleagues grouped by firm/client ──────────────

portalPeopleRouter.get(
  '/people',
  asyncHandler(async (req, res) => {
    const { clientUserId: requesterId } = req.clientAuth!;

    // Find every client_id the requester belongs to (active client_portal_access).
    const myClientsResult = await db.query<{ client_id: string }>(
      `select distinct client_id
         from public.client_portal_access
        where client_user_id = $1 and status = 'active'`,
      [requesterId]
    );

    if (myClientsResult.rows.length === 0) {
      res.status(200).json([]);
      return;
    }

    const clientIds = myClientsResult.rows.map((r) => r.client_id);

    // For each client_id, get all active members + org info.
    const membersResult = await db.query<{
      client_id: string;
      organization_id: string;
      firm_name: string;
      client_user_id: string;
      email: string;
      full_name: string | null;
      encrypted_password: string | null;
      granted_by: string | null;
    }>(
      `
      select
        cpa.client_id,
        cpa.organization_id,
        o.name       as firm_name,
        cu.id        as client_user_id,
        cu.email,
        cu.full_name,
        cu.encrypted_password,
        cpa.granted_by
      from public.client_portal_access cpa
      join public.client_users cu on cu.id = cpa.client_user_id
      join public.organizations o on o.id = cpa.organization_id
      where cpa.client_id = any($1::uuid[])
        and cpa.status = 'active'
      order by cpa.client_id, cu.email
      `,
      [clientIds]
    );

    // Group by client_id in JS.
    const grouped = new Map<
      string,
      {
        client: { clientId: string; organizationId: string; firmName: string };
        members: Array<{
          clientUserId: string;
          email: string;
          fullName: string | null;
          pending: boolean;
          invitedByMe: boolean;
        }>;
      }
    >();

    for (const r of membersResult.rows) {
      if (!grouped.has(r.client_id)) {
        grouped.set(r.client_id, {
          client: {
            clientId: r.client_id,
            organizationId: r.organization_id,
            firmName: r.firm_name,
          },
          members: [],
        });
      }
      grouped.get(r.client_id)!.members.push({
        clientUserId: r.client_user_id,
        email: r.email,
        fullName: r.full_name,
        pending: r.encrypted_password === null,
        invitedByMe: r.granted_by === requesterId,
      });
    }

    res.status(200).json([...grouped.values()]);
  })
);

// ── POST /people — invite a colleague at the client/org level ──────────────

portalPeopleRouter.post(
  '/people',
  asyncHandler(async (req, res) => {
    const { clientUserId: requesterId } = req.clientAuth!;
    const { clientId, email, fullName } = inviteBodySchema.parse(req.body);

    // Throttle invites per requester: an invite triggers a real email to an
    // arbitrary, caller-supplied address, so cap it to deter spam/email
    // amplification on top of the global per-IP limiter. 20 invites / 10 min.
    const rl = checkRateLimit(`portal:invite:${requesterId}`, 20, 600_000);
    if (!rl.allowed) {
      throw new ApiError(
        `Too many invitations. Try again in ${rl.retryAfter}s.`,
        429,
        'RATE_LIMITED'
      );
    }

    // (1) Verify requester has active client_portal_access on clientId.
    const accessCheck = await db.query<{ one: number }>(
      `select 1 as one from public.client_portal_access
        where client_user_id = $1 and client_id = $2 and status = 'active'
        limit 1`,
      [requesterId, clientId]
    );
    if (accessCheck.rows.length === 0) {
      throw new ApiError('Forbidden', 403, 'FORBIDDEN');
    }

    // (2) Resolve organization_id + firm name from the requester's row.
    const orgResult = await db.query<{ organization_id: string; org_name: string }>(
      `select cpa.organization_id, o.name as org_name
         from public.client_portal_access cpa
         join public.organizations o on o.id = cpa.organization_id
        where cpa.client_user_id = $1 and cpa.client_id = $2 and cpa.status = 'active'
        limit 1`,
      [requesterId, clientId]
    );
    const orgRow = orgResult.rows[0];
    if (!orgRow) {
      throw new ApiError('Forbidden', 403, 'FORBIDDEN');
    }
    const orgId = orgRow.organization_id;
    const firmName = orgRow.org_name;

    // (3) Prevent self-invite.
    const selfResult = await db.query<{ email: string; full_name: string | null }>(
      `select email, full_name from public.client_users where id = $1 limit 1`,
      [requesterId]
    );
    const self = selfResult.rows[0];
    if (self && self.email.toLowerCase() === email.toLowerCase()) {
      throw new ApiError('You cannot invite yourself', 400, 'INVITE_SELF');
    }

    // (4) Find-or-create the global client_user for the invitee.
    const { clientUserId: newId, inviteToken } = await ensureClientUserForInvite(email, fullName);

    // (5) Upsert client-level grant on client_portal_access.
    await db.query(
      `insert into public.client_portal_access
         (client_user_id, client_id, organization_id, role, status, granted_by, granted_by_type)
       values ($1, $2, $3, 'viewer', 'active', $4, 'client')
       on conflict (client_user_id, client_id)
         do update set status = 'active', revoked_at = null`,
      [newId, clientId, orgId, requesterId]
    );

    // (6) Best-effort invite email — client-level (no matterTitle).
    try {
      await sendClientPortalInviteEmail({
        email,
        firmName,
        inviterName: self?.full_name ?? undefined,
        inviteToken,
      });
    } catch (err) {
      console.error('[portalPeople] invite email failed', {
        to: email,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // (7) Respond 201. We do NOT echo whether the invitee already had an
    // account — that was an account-existence oracle. `pending` is constant.
    res.status(201).json({ clientUserId: newId, pending: true });
  })
);

// ── DELETE /people/:clientUserId — revoke a colleague's access ────────────

portalPeopleRouter.delete(
  '/people/:clientUserId',
  asyncHandler(async (req, res) => {
    const { clientUserId: requesterId } = req.clientAuth!;
    const { clientUserId: targetClientUserId } = clientUserIdParamsSchema.parse(req.params);

    // Accept clientId from query string or body.
    const rawClientId = req.query.clientId ?? req.body?.clientId;
    const { clientId } = clientIdQuerySchema.parse({ clientId: rawClientId });

    const result = await db.query<{ id: string }>(
      `update public.client_portal_access
          set status     = 'revoked',
              revoked_at = now()
        where client_id      = $1
          and client_user_id = $2
          and granted_by     = $3
          and status         = 'active'
       returning id`,
      [clientId, targetClientUserId, requesterId]
    );

    if ((result.rowCount ?? 0) === 0) {
      throw new ApiError('Team member not found', 404, 'NOT_FOUND');
    }

    res.status(200).json({ ok: true });
  })
);
