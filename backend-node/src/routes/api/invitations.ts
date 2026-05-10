import crypto from 'node:crypto';

import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { isPlatformAdminUser } from '../../services/authorization.js';
import { sendInvitationEmail } from '../../services/email.js';

const ROLE_LEVELS: Record<string, number> = {
  user: 1,
  admin: 2,
  superadmin: 3,
  platform_admin: 4,
};

function getRoleLevel(role: string): number {
  return ROLE_LEVELS[role] ?? 0;
}

const invitationIdParamsSchema = z.object({
  invitationId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
});

const inviteSchema = z.object({
  email: z.string().email(),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  role: z.string().trim().optional(),
  department: z.string().trim().optional(),
  inviterName: z.string().trim().optional(),
  organizationName: z.string().trim().optional(),
  invitationUrl: z.string().trim().url().optional(),
});

const resendSchema = z.object({
  invitationId: z
    .string()
    .regex(/^[0-9a-fA-F-]{36}$/)
    .optional(),
  email: z.string().email().optional(),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  role: z.string().trim().optional(),
  department: z.string().trim().optional(),
  invitationUrl: z.string().trim().url().optional(),
});

const checkAndApplySchema = z.object({
  p_user_id: z.string().optional(),
  p_email: z.string().email().optional(),
});

export const invitationsRouter = Router();

invitationsRouter.post(
  '/invite',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = inviteSchema.parse(req.body);

    // Require admin/superadmin role or platform admin
    const isPlatAdmin = await isPlatformAdminUser(auth.userId);
    const roleResult = await db.query(
      `SELECT role_name FROM public.user_role_assignments WHERE user_id = $1 AND organization_id = $2`,
      [auth.userId, auth.organizationId]
    );
    const inviterRoles = roleResult.rows.map((r: Record<string, unknown>) => r.role_name as string);
    if (!isPlatAdmin && !inviterRoles.includes('admin') && !inviterRoles.includes('superadmin')) {
      throw new ApiError('Forbidden', 403, 'FORBIDDEN');
    }

    // Prevent inviting a user with a higher role than the inviter
    const inviterMaxLevel = Math.max(...inviterRoles.map(getRoleLevel), 0);
    const invitedRole = body.role || 'user';
    if (getRoleLevel(invitedRole) > inviterMaxLevel && !isPlatAdmin) {
      throw new ApiError('Cannot assign a role higher than your own', 403, 'FORBIDDEN');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const existing = await db.query(
      `
      select id
      from public.invitations
      where organization_id = $1
        and lower(email) = lower($2)
        and status = 'pending'
      order by created_at desc
      limit 1
      `,
      [auth.organizationId, body.email]
    );

    let invitationId: string;

    if (existing.rows[0]?.id) {
      const updated = await db.query(
        `
        update public.invitations
        set first_name = $1,
            last_name = $2,
            role = $3,
            department = $4,
            invited_by = $5,
            token = $6,
            expires_at = $7,
            status = 'pending',
            updated_at = now()
        where id = $8
        returning id
        `,
        [
          body.firstName || null,
          body.lastName || null,
          body.role || 'user',
          body.department || null,
          auth.userId,
          tokenHash,
          expiresAt,
          existing.rows[0].id,
        ]
      );
      invitationId = updated.rows[0].id as string;
    } else {
      const inserted = await db.query(
        `
        insert into public.invitations (
          email,
          first_name,
          last_name,
          role,
          department,
          organization_id,
          invited_by,
          token,
          expires_at,
          status,
          created_at,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', now(), now())
        returning id
        `,
        [
          body.email.toLowerCase(),
          body.firstName || null,
          body.lastName || null,
          body.role || 'user',
          body.department || null,
          auth.organizationId,
          auth.userId,
          tokenHash,
          expiresAt,
        ]
      );
      invitationId = inserted.rows[0].id as string;
    }

    const inviterProfile = await db.query(
      `
      select p.first_name, p.last_name, o.name as organization_name
      from public.profiles p
      left join public.organizations o on o.id = p.organization_id
      where p.user_id = $1
      limit 1
      `,
      [auth.userId]
    );

    const inviter = inviterProfile.rows[0] as
      | { first_name?: string | null; last_name?: string | null; organization_name?: string | null }
      | undefined;

    const inviterName =
      body.inviterName ||
      `${inviter?.first_name || ''} ${inviter?.last_name || ''}`.trim() ||
      'A team member';
    const organizationName =
      body.organizationName || inviter?.organization_name || 'your organization';

    try {
      await sendInvitationEmail(body.email, inviterName, organizationName, body.role, {
        invitationUrl: body.invitationUrl,
        token,
      });
    } catch (err) {
      console.error('Invitation email failed:', err instanceof Error ? err.message : err);
    }

    res.status(200).json({ success: true, invitationId });
  })
);

invitationsRouter.post(
  '/resend',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = resendSchema.parse(req.body);

    let invitation = null as {
      id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      role: string | null;
      department: string | null;
    } | null;

    if (body.invitationId) {
      const byId = await db.query(
        `
        select id, email, first_name, last_name, role, department
        from public.invitations
        where id = $1 and organization_id = $2
        limit 1
        `,
        [body.invitationId, auth.organizationId]
      );
      invitation = (byId.rows[0] as typeof invitation) || null;
    }

    if (!invitation && body.email) {
      const byEmail = await db.query(
        `
        select id, email, first_name, last_name, role, department
        from public.invitations
        where organization_id = $1
          and lower(email) = lower($2)
        order by created_at desc
        limit 1
        `,
        [auth.organizationId, body.email]
      );
      invitation = (byEmail.rows[0] as typeof invitation) || null;
    }

    if (!invitation) {
      throw new ApiError('Invitation not found', 404, 'NOT_FOUND');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await db.query(
      `
      update public.invitations
      set token = $1,
          expires_at = $2,
          status = 'pending',
          updated_at = now()
      where id = $3
      `,
      [tokenHash, expiresAt, invitation.id]
    );

    const profile = await db.query(
      `
      select p.first_name, p.last_name, o.name as org_name
      from public.profiles p
      left join public.organizations o on o.id = p.organization_id
      where p.user_id = $1
      limit 1
      `,
      [auth.userId]
    );

    const row = profile.rows[0] as
      | { first_name?: string | null; last_name?: string | null; org_name?: string | null }
      | undefined;
    const inviterName =
      `${row?.first_name || ''} ${row?.last_name || ''}`.trim() || 'A team member';
    const orgName = row?.org_name || 'your organization';

    try {
      await sendInvitationEmail(
        invitation.email,
        inviterName,
        orgName,
        invitation.role || undefined,
        {
          invitationUrl: body.invitationUrl,
          token,
        }
      );
    } catch (err) {
      console.error('Invitation resend failed:', err instanceof Error ? err.message : err);
    }

    res.status(200).json({ success: true });
  })
);

invitationsRouter.delete(
  '/:invitationId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { invitationId } = invitationIdParamsSchema.parse(req.params);

    const result = await db.query(
      `
      delete from public.invitations
      where id = $1
        and organization_id = $2
      returning id
      `,
      [invitationId, auth.organizationId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Invitation not found', 404, 'NOT_FOUND');
    }

    res.status(204).send();
  })
);

invitationsRouter.post(
  '/check-and-apply',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = checkAndApplySchema.parse(req.body || {});

    const targetEmail = auth.email || body.p_email;
    if (!targetEmail) {
      res.status(200).json({ applied: false });
      return;
    }

    const invitationResult = await db.query(
      `
      select id, organization_id, role, first_name, last_name, department
      from public.invitations
      where lower(email) = lower($1)
        and status = 'pending'
        and expires_at > now()
      order by created_at desc
      limit 1
      `,
      [targetEmail]
    );

    const invitation = invitationResult.rows[0] as
      | {
          id: string;
          organization_id: string;
          role: string | null;
          first_name: string | null;
          last_name: string | null;
          department: string | null;
        }
      | undefined;

    if (!invitation) {
      res.status(200).json({ applied: false });
      return;
    }

    await db.query(
      `
      update public.profiles
      set organization_id = $1,
          role = coalesce($2, role),
          first_name = coalesce(nullif(first_name, ''), $3),
          last_name = coalesce(nullif(last_name, ''), $4),
          department = coalesce(nullif(department, ''), $5),
          updated_at = now()
      where user_id = $6
      `,
      [
        invitation.organization_id,
        invitation.role || 'user',
        invitation.first_name,
        invitation.last_name,
        invitation.department,
        auth.userId,
      ]
    );

    if (invitation.role) {
      await db.query(
        `
        insert into public.user_role_assignments (user_id, role_name, organization_id, assigned_by, created_at)
        values ($1, $2, $3, $4, now())
        on conflict do nothing
        `,
        [auth.userId, invitation.role, invitation.organization_id, auth.userId]
      );
    }

    await db.query(
      `
      update public.invitations
      set status = 'accepted', updated_at = now()
      where id = $1
      `,
      [invitation.id]
    );

    res.status(200).json({ applied: true });
  })
);
