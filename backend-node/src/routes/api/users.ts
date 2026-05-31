import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import {
  isPlatformAdminUser,
  isPlatformStaff,
  requirePlatformAdminUser,
} from '../../services/authorization.js';
import { sendInvitationEmail } from '../../services/email.js';
import { assertSeatAvailableTx } from '../../services/seats.js';

const ROLE_LEVELS: Record<string, number> = {
  user: 1,
  admin: 2,
  superadmin: 3,
  platform_admin: 4,
};

function getRoleLevel(role: string): number {
  return ROLE_LEVELS[role] ?? 0;
}

const userIdParamsSchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
});

const invitationIdParamsSchema = z.object({
  invitationId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
});

const toggleUserStatusBodySchema = z.object({
  disable: z.boolean(),
});

const changeUserRoleBodySchema = z.object({
  role: z.string().trim().min(1),
});

const inviteUserBodySchema = z.object({
  email: z.string().email(),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  role: z.string().trim().optional(),
  roleId: z.string().trim().optional(),
  department: z.string().trim().optional(),
});

export const usersRouter = Router();

usersRouter.get(
  '/is-platform-admin',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    // Any platform staff role (superadmin, support, billing) may enter the
    // /thanos panel; individual tabs/actions are capability-gated server-side.
    const isPlatformAdmin = await isPlatformStaff(auth.userId);
    res.status(200).json({ isPlatformAdmin });
  })
);

usersRouter.get(
  '/all',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);

    const result = await db.query(
      `
      select
        p.*,
        o.name as organization_name,
        o.type as organization_type
      from public.profiles p
      left join public.organizations o on o.id = p.organization_id
      order by p.created_at desc
      `
    );

    res.status(200).json(result.rows);
  })
);

usersRouter.get(
  '/all/:userId',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);
    const { userId } = userIdParamsSchema.parse(req.params);

    const result = await db.query(
      `
      select
        p.*,
        o.name as organization_name,
        o.type as organization_type
      from public.profiles p
      left join public.organizations o on o.id = p.organization_id
      where p.user_id = $1
      limit 1
      `,
      [userId]
    );

    res.status(200).json(result.rows[0] || null);
  })
);

usersRouter.get(
  '/organization-users',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db.query(
      `
      select *
      from public.get_organization_users($1::uuid)
      `,
      [auth.organizationId]
    );

    res.status(200).json(result.rows);
  })
);

usersRouter.patch(
  '/:userId/status',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { userId } = userIdParamsSchema.parse(req.params);
    const { disable } = toggleUserStatusBodySchema.parse(req.body);

    // Require admin/superadmin role or platform admin
    const isPlatAdmin = await isPlatformAdminUser(auth.userId);
    if (!isPlatAdmin) {
      const roleResult = await db.query(
        `SELECT role_name FROM public.user_role_assignments WHERE user_id = $1 AND organization_id = $2`,
        [auth.userId, auth.organizationId]
      );
      const roles = roleResult.rows.map((r: Record<string, unknown>) => r.role_name as string);
      if (!roles.includes('admin') && !roles.includes('superadmin')) {
        throw new ApiError('Forbidden', 403, 'FORBIDDEN');
      }
    }

    // Ensure target user belongs to the same organization
    const targetUser = await db.query(
      `SELECT organization_id FROM public.profiles WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    if (!targetUser.rows[0] || targetUser.rows[0].organization_id !== auth.organizationId) {
      throw new ApiError('User not found', 404, 'NOT_FOUND');
    }

    const result = await db.query(
      'select public.toggle_user_status($1::uuid, $2::boolean) as result',
      [userId, disable]
    );

    res.status(200).json(result.rows[0]?.result ?? { success: true });
  })
);

usersRouter.patch(
  '/:userId/role',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { userId } = userIdParamsSchema.parse(req.params);
    const { role } = changeUserRoleBodySchema.parse(req.body);

    // Require admin/superadmin role or platform admin
    const isPlatAdmin = await isPlatformAdminUser(auth.userId);
    if (!isPlatAdmin) {
      const roleResult = await db.query(
        `SELECT role_name FROM public.user_role_assignments WHERE user_id = $1 AND organization_id = $2`,
        [auth.userId, auth.organizationId]
      );
      const roles = roleResult.rows.map((r: Record<string, unknown>) => r.role_name as string);
      if (!roles.includes('admin') && !roles.includes('superadmin')) {
        throw new ApiError('Forbidden', 403, 'FORBIDDEN');
      }
    }

    // Ensure target user belongs to the same organization
    const targetUser = await db.query(
      `SELECT organization_id FROM public.profiles WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    if (!targetUser.rows[0] || targetUser.rows[0].organization_id !== auth.organizationId) {
      throw new ApiError('User not found', 404, 'NOT_FOUND');
    }

    if (role === 'platform_admin') {
      throw new ApiError('Platform admin role cannot be assigned through the application.', 400);
    }

    const result = await db.query('select public.change_user_role($1::uuid, $2::text) as result', [
      userId,
      role,
    ]);

    res.status(200).json(result.rows[0]?.result ?? { success: true });
  })
);

usersRouter.delete(
  '/invitations/:invitationId',
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

    if ((result.rowCount || 0) === 0) {
      throw new ApiError('Invitation not found', 404, 'NOT_FOUND');
    }

    res.status(204).send();
  })
);

usersRouter.get(
  '/with-roles',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const [profilesResult, assignmentsResult] = await Promise.all([
      db.query(
        `
        select
          id,
          user_id,
          first_name,
          last_name,
          email,
          role,
          department,
          title,
          avatar_url
        from public.profiles
        where organization_id = $1
        order by first_name asc
        `,
        [auth.organizationId]
      ),
      db.query(
        `
        select user_id, role_name
        from public.user_role_assignments
        where organization_id = $1
        `,
        [auth.organizationId]
      ),
    ]);

    const assignmentsByUser = new Map<string, string[]>();
    assignmentsResult.rows.forEach((row) => {
      const userId = String((row as Record<string, unknown>).user_id || '');
      const roleName = String((row as Record<string, unknown>).role_name || '');
      if (!userId || !roleName) return;
      assignmentsByUser.set(userId, [...(assignmentsByUser.get(userId) || []), roleName]);
    });

    const usersWithRoles = profilesResult.rows.map((row) => {
      const userId = String((row as Record<string, unknown>).user_id || '');
      return {
        ...row,
        custom_roles: assignmentsByUser.get(userId) || [],
      };
    });

    res.status(200).json(usersWithRoles);
  })
);

usersRouter.get(
  '/role-assignments/me',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db.query(
      `
      select
        id,
        role_name,
        organization_id,
        assigned_by,
        created_at
      from public.user_role_assignments
      where user_id = $1
      `,
      [auth.userId]
    );

    res.status(200).json(result.rows);
  })
);

usersRouter.get(
  '/me/role',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const [profileResult, roleAssignmentsResult] = await Promise.all([
      db.query(
        `
        select organization_id, is_organization_creator
        from public.profiles
        where user_id = $1
        limit 1
        `,
        [auth.userId]
      ),
      db.query(
        `
        select role_name
        from public.user_role_assignments
        where user_id = $1
          and organization_id = $2
        `,
        [auth.userId, auth.organizationId]
      ),
    ]);

    const profile = profileResult.rows[0] as
      | {
          organization_id: string | null;
          is_organization_creator: boolean | null;
        }
      | undefined;

    if (!profile?.organization_id) {
      throw new ApiError('Profile not found', 404, 'NOT_FOUND');
    }

    const roles = roleAssignmentsResult.rows
      .map((row) => (row as { role_name?: string }).role_name)
      .filter((role): role is string => Boolean(role));

    const primaryRole = roles.includes('superadmin')
      ? 'superadmin'
      : roles.includes('admin')
        ? 'admin'
        : roles.includes('user')
          ? 'user'
          : roles[0] || 'user';

    res.status(200).json({
      role: primaryRole,
      roles,
      is_organization_creator: Boolean(profile.is_organization_creator),
    });
  })
);

usersRouter.post(
  '/invite',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = inviteUserBodySchema.parse(req.body);

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
      // Re-inviting an already-pending email reuses its existing seat, so no
      // seat check is needed here.
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
          body.firstName,
          body.lastName,
          body.role || 'user',
          body.department || null,
          auth.userId,
          token,
          expiresAt,
          existing.rows[0].id,
        ]
      );
      invitationId = updated.rows[0].id as string;
    } else {
      // Net-new invite consumes a seat. Do the seat check and the insert in
      // one transaction with the subscription row locked, so concurrent
      // invites can't both slip past the last free seat (TOCTOU).
      const client = await db.connect();
      try {
        await client.query('begin');
        // Platform admins manage orgs on the firm's behalf and aren't billed,
        // so they bypass seat limits (incl. orgs with no live plan / 0 seats).
        if (!isPlatAdmin) await assertSeatAvailableTx(client, auth.organizationId, 1);
        const inserted = await client.query(
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
            body.firstName,
            body.lastName,
            body.role || 'user',
            body.department || null,
            auth.organizationId,
            auth.userId,
            token,
            expiresAt,
          ]
        );
        await client.query('commit');
        invitationId = inserted.rows[0].id as string;
      } catch (err) {
        await client.query('rollback').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    }

    const sender = await db.query(
      `
      select p.first_name, p.last_name, o.name as org_name
      from public.profiles p
      left join public.organizations o on o.id = p.organization_id
      where p.user_id = $1
      limit 1
      `,
      [auth.userId]
    );
    const row = sender.rows[0] as
      | { first_name?: string | null; last_name?: string | null; org_name?: string | null }
      | undefined;

    const inviterName =
      `${row?.first_name || ''} ${row?.last_name || ''}`.trim() || 'A team member';
    const orgName = row?.org_name || 'your organization';

    try {
      await sendInvitationEmail(body.email, inviterName, orgName, body.role, { token });
    } catch (err) {
      console.error('Invitation email failed:', err instanceof Error ? err.message : err);
    }

    res.status(200).json({ success: true, userId: invitationId });
  })
);

usersRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const profile = await db.query(
      `
      select *
      from public.profiles
      where user_id = $1
      limit 1
      `,
      [auth.userId]
    );

    res.status(200).json({
      user: {
        id: auth.userId,
        email: auth.email,
        organization_id: auth.organizationId,
      },
      profile: profile.rows[0] || null,
    });
  })
);

usersRouter.patch(
  '/me/profile',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = req.body as Record<string, unknown>;

    const allowedFields = ['first_name', 'last_name', 'phone', 'department', 'title', 'avatar_url'];
    const updates: Array<{ col: string; val: unknown }> = [];
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push({ col: field, val: body[field] });
      }
    }

    if (!updates.length) {
      const current = await db.query('select * from public.profiles where user_id = $1 limit 1', [
        auth.userId,
      ]);
      res.status(200).json(current.rows[0] || null);
      return;
    }

    const setClause = updates.map((u, i) => `${u.col} = $${i + 1}`).join(', ');
    const values = updates.map((u) => u.val);

    const result = await db.query(
      `update public.profiles set ${setClause}, updated_at = now() where user_id = $${values.length + 1} returning *`,
      [...values, auth.userId]
    );

    res.status(200).json(result.rows[0] || null);
  })
);

// ── Password status (check if user must change password) ────────────────────

usersRouter.get(
  '/me/password-status',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db.query(
      `SELECT p.must_change_password, p.password_reset_required
       FROM public.profiles p
       WHERE p.user_id = $1
       LIMIT 1`,
      [auth.userId]
    );

    const profile = result.rows[0] as
      | {
          must_change_password?: boolean;
          password_reset_required?: boolean;
        }
      | undefined;

    res.status(200).json({
      must_change_password: Boolean(
        profile?.must_change_password || profile?.password_reset_required
      ),
    });
  })
);
