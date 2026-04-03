import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';

const uuidLike = z.string().regex(/^[0-9a-fA-F-]{36}$/);

export const rolesRouter = Router();

rolesRouter.get(
  '/all',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const [globals, customs] = await Promise.all([
      db
        .query<Record<string, unknown>>('select * from public.global_roles order by role asc')
        .then((result) => result.rows)
        .catch(() => []),
      db
        .query<Record<string, unknown>>(
          'select * from public.user_roles where organization_id = $1 order by role_name asc',
          [auth.organizationId]
        )
        .then((result) => result.rows)
        .catch(() => []),
    ]);

    const globalRoles = globals
      .filter((role) => role.role !== 'platform_admin')
      .map((role) => ({
        id: role.role,
        role: role.role,
        role_name: role.role,
        display_name: role.display_name,
        description: role.description,
        source: 'global' as const,
      }));

    const customRoles = customs
      .filter((role) => role.role_name !== 'platform_admin')
      .map((role) => ({
        id: role.id,
        role: role.role_name,
        role_name: role.role_name,
        display_name: role.role_name,
        description: role.description,
        source: 'custom' as const,
      }));

    res.status(200).json([...globalRoles, ...customRoles]);
  })
);

// ── Org-scoped user_roles CRUD ──────────────────────────────────────────────

rolesRouter.get(
  '/org',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db.query(
      'select * from public.user_roles where organization_id = $1 order by role_name asc',
      [auth.organizationId]
    );

    res.status(200).json(result.rows);
  })
);

rolesRouter.post(
  '/org',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = z
      .object({
        role_name: z.string().trim().min(1),
        description: z.string().optional(),
        permissions: z.array(z.string()).optional(),
      })
      .parse(req.body);

    if (body.role_name === 'platform_admin') {
      throw new ApiError('Cannot create reserved role name', 400, 'VALIDATION_ERROR');
    }

    const result = await db.query(
      `
      insert into public.user_roles (role_name, description, permissions, organization_id, created_by, created_at, updated_at)
      values ($1, $2, $3, $4, $5, now(), now())
      returning *
      `,
      [
        body.role_name,
        body.description || null,
        JSON.stringify(body.permissions || []),
        auth.organizationId,
        auth.userId,
      ]
    );

    res.status(201).json(result.rows[0]);
  })
);

rolesRouter.delete(
  '/org/:roleId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { roleId } = z.object({ roleId: uuidLike }).parse(req.params);

    const result = await db.query(
      'delete from public.user_roles where id = $1 and organization_id = $2 returning id',
      [roleId, auth.organizationId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Role not found', 404, 'NOT_FOUND');
    }

    res.status(204).send();
  })
);

// ── Role assignments ────────────────────────────────────────────────────────

rolesRouter.get(
  '/assignments/me',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db.query(
      `
      select id, role_name, organization_id, assigned_by, created_at
      from public.user_role_assignments
      where user_id = $1
      `,
      [auth.userId]
    );

    const roles = result.rows.map((r: Record<string, unknown>) => r.role_name as string);
    const primaryRole = roles.includes('superadmin')
      ? 'superadmin'
      : roles.includes('admin')
        ? 'admin'
        : roles.includes('user')
          ? 'user'
          : roles[0] || 'user';

    res.status(200).json({
      assignments: result.rows,
      roles,
      primaryRole,
      isSuperAdmin: roles.includes('superadmin'),
      isAdmin: roles.includes('admin') || roles.includes('superadmin'),
    });
  })
);

rolesRouter.get(
  '/users-with-roles',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const [profiles, assignments] = await Promise.all([
      db.query(
        `
        select id, user_id, first_name, last_name, email, role, department, title, avatar_url
        from public.profiles
        where organization_id = $1
        order by first_name
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

    const assignmentMap = new Map<string, string[]>();
    for (const row of assignments.rows as Array<{ user_id: string; role_name: string }>) {
      const existing = assignmentMap.get(row.user_id) || [];
      existing.push(row.role_name);
      assignmentMap.set(row.user_id, existing);
    }

    const merged = profiles.rows.map((u: Record<string, unknown>) => ({
      ...u,
      custom_roles: assignmentMap.get(u.user_id as string) || [],
    }));

    res.status(200).json(merged);
  })
);

// ── Permissions ─────────────────────────────────────────────────────────────

rolesRouter.get(
  '/permissions',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const roleName = typeof req.query.roleName === 'string' ? req.query.roleName : undefined;

    const clauses = ['organization_id = $1'];
    const values: unknown[] = [auth.organizationId];

    if (roleName) {
      values.push(roleName);
      clauses.push(`role_name = $${values.length}`);
    }

    const result = await db
      .query(
        `select * from public.role_permissions where ${clauses.join(' and ')} order by resource, action`,
        values
      )
      .catch(() => ({ rows: [] }));

    res.status(200).json(result.rows);
  })
);

rolesRouter.put(
  '/permissions',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = z
      .object({
        role_name: z.string().trim().min(1),
        resource: z.string().trim().min(1),
        action: z.string().trim().min(1),
        granted: z.boolean(),
      })
      .parse(req.body);

    const result = await db.query(
      `
      insert into public.role_permissions (role_name, organization_id, resource, action, granted, created_by, created_at, updated_at)
      values ($1, $2, $3, $4, $5, $6, now(), now())
      on conflict (role_name, organization_id, resource, action)
      do update set granted = excluded.granted, updated_at = now()
      returning *
      `,
      [body.role_name, auth.organizationId, body.resource, body.action, body.granted, auth.userId]
    );

    res.status(200).json(result.rows[0]);
  })
);

rolesRouter.get(
  '/permissions/check',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { resource, action } = z
      .object({ resource: z.string(), action: z.string() })
      .parse(req.query);

    // Get user's roles
    const assignmentsResult = await db.query(
      'select role_name from public.user_role_assignments where user_id = $1 and organization_id = $2',
      [auth.userId, auth.organizationId]
    );

    const roles = assignmentsResult.rows.map((r: Record<string, unknown>) => r.role_name as string);

    // Superadmin/admin have all permissions
    if (roles.includes('superadmin') || roles.includes('admin')) {
      res.status(200).json({ granted: true });
      return;
    }

    if (!roles.length) {
      res.status(200).json({ granted: false });
      return;
    }

    const placeholders = roles.map((_, i) => `$${i + 3}`).join(', ');
    const permResult = await db
      .query(
        `
      select granted
      from public.role_permissions
      where organization_id = $1
        and resource = $2
        and role_name in (${placeholders})
        and action = $${roles.length + 3}
        and granted = true
      limit 1
      `,
        [auth.organizationId, resource, ...roles, action]
      )
      .catch(() => ({ rows: [] }));

    res.status(200).json({ granted: Boolean(permResult.rows[0]) });
  })
);
