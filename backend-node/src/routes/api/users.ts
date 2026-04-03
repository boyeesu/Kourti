import { Router } from 'express';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { isPlatformAdminUser, requirePlatformAdminUser } from '../../services/authorization.js';

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
    const isPlatformAdmin = await isPlatformAdminUser(auth.userId);
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
    const { userId } = userIdParamsSchema.parse(req.params);
    const { disable } = toggleUserStatusBodySchema.parse(req.body);

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
    const { userId } = userIdParamsSchema.parse(req.params);
    const { role } = changeUserRoleBodySchema.parse(req.body);

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

    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new ApiError('Supabase config missing for invite flow', 503, 'CONFIG_ERROR');
    }

    const response = await fetch(`${env.SUPABASE_URL}/functions/v1/create-invited-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        email: body.email,
        firstName: body.firstName,
        lastName: body.lastName,
        role: body.role || 'user',
        department: body.department,
        organizationId: auth.organizationId,
        invitedBy: auth.userId,
      }),
    });

    const data = (await response.json().catch(() => null)) as {
      success?: boolean;
      error?: string;
      userId?: string;
    } | null;

    if (!response.ok) {
      throw new ApiError(data?.error || 'Failed to create user account', response.status);
    }

    res.status(200).json(data ?? { success: false, error: 'Unknown response from invite flow' });
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
