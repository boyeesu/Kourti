import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { requirePlatformAdminUser } from '../../services/authorization.js';

const organizationIdParamsSchema = z.object({
  organizationId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
});

const toggleOrganizationStatusBodySchema = z.object({
  isActive: z.boolean(),
});

const deleteOrganizationBodySchema = z.object({
  reason: z.string().trim().optional(),
});

export const organizationsRouter = Router();

organizationsRouter.get(
  '/all',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);

    const result = await db.query<
      {
        id: string;
        user_count: number;
      } & Record<string, unknown>
    >(
      `
      select
        o.*,
        count(p.user_id)::int as user_count
      from public.organizations o
      left join public.profiles p on p.organization_id = o.id
      group by o.id
      order by o.created_at desc
      `
    );

    res.status(200).json(
      result.rows.map((row) => ({
        ...row,
        status: (row.status as string | undefined) || 'active',
        is_active: typeof row.is_active === 'boolean' ? row.is_active : true,
      }))
    );
  })
);

organizationsRouter.get(
  '/current',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db.query(
      `
      select *
      from public.organizations
      where id = $1
      limit 1
      `,
      [auth.organizationId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Organization not found', 404, 'NOT_FOUND');
    }

    const row = result.rows[0] as Record<string, unknown>;
    res.status(200).json({
      ...row,
      status: (row.status as string | undefined) || 'active',
      is_active: typeof row.is_active === 'boolean' ? row.is_active : true,
    });
  })
);

organizationsRouter.get(
  '/:organizationId',
  asyncHandler(async (req, res) => {
    const { organizationId } = organizationIdParamsSchema.parse(req.params);
    const auth = req.auth!;

    if (organizationId !== auth.organizationId) {
      throw new ApiError('Forbidden', 403, 'FORBIDDEN');
    }

    const result = await db.query(
      `
      select *
      from public.organizations
      where id = $1
      limit 1
      `,
      [organizationId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Organization not found', 404, 'NOT_FOUND');
    }

    const row = result.rows[0] as Record<string, unknown>;
    res.status(200).json({
      ...row,
      status: (row.status as string | undefined) || 'active',
      is_active: typeof row.is_active === 'boolean' ? row.is_active : true,
    });
  })
);

organizationsRouter.get(
  '/current/members',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db.query(
      `
      select *
      from public.profiles
      where organization_id = $1
      order by created_at desc
      `,
      [auth.organizationId]
    );

    res.status(200).json(result.rows);
  })
);

organizationsRouter.get(
  '/current/users',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    // Combine profiles + invitations (like the Supabase RPC get_organization_users)
    const [profiles, invitations] = await Promise.all([
      db.query(
        `
        select
          p.id, p.user_id, p.email, p.first_name, p.last_name,
          coalesce(p.role, 'user') as role,
          p.department, p.organization_id,
          'active' as status,
          'user' as user_type,
          'verified' as verification_status,
          p.created_at
        from public.profiles p
        where p.organization_id = $1
        order by p.created_at desc
        `,
        [auth.organizationId]
      ),
      db
        .query(
          `
        select
          i.id, null as user_id, i.email,
          null as first_name, null as last_name,
          coalesce(i.role, 'user') as role,
          i.department, i.organization_id,
          coalesce(i.status, 'pending') as status,
          'invitation' as user_type,
          'pending' as verification_status,
          i.created_at
        from public.invitations i
        where i.organization_id = $1
          and i.status = 'pending'
        order by i.created_at desc
        `,
          [auth.organizationId]
        )
        .catch(() => ({ rows: [] })),
    ]);

    res.status(200).json([...profiles.rows, ...invitations.rows]);
  })
);

organizationsRouter.patch(
  '/:organizationId/status',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);
    const { organizationId } = organizationIdParamsSchema.parse(req.params);
    const { isActive } = toggleOrganizationStatusBodySchema.parse(req.body);

    const result = await db
      .query('select public.toggle_organization_status($1::uuid, $2::boolean) as result', [
        organizationId,
        isActive,
      ])
      .catch(async () => {
        const fallback = await db.query(
          "update public.organizations set is_active = $1, status = case when $1 then 'active' else 'disabled' end, updated_at = now() where id = $2 returning id",
          [isActive, organizationId]
        );
        return { rows: [{ result: { success: Boolean(fallback.rowCount) } }] };
      });

    res.status(200).json(result.rows[0]?.result ?? { success: true });
  })
);

organizationsRouter.delete(
  '/:organizationId',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);
    const { organizationId } = organizationIdParamsSchema.parse(req.params);
    const { reason } = deleteOrganizationBodySchema.parse(req.body ?? {});

    const result = await db
      .query('select public.delete_organization_safe($1::uuid, $2::text) as result', [
        organizationId,
        reason || null,
      ])
      .catch(async () => {
        const fallback = await db.query('delete from public.organizations where id = $1', [
          organizationId,
        ]);
        return { rows: [{ result: { success: Boolean(fallback.rowCount) } }] };
      });

    res.status(200).json(result.rows[0]?.result ?? { success: true });
  })
);
