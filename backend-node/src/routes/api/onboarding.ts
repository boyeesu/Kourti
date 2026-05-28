import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';

const completeOnboardingSchema = z.object({
  organization: z.object({
    name: z.string().trim().min(1).max(200),
    type: z.string().trim().max(100).optional().nullable(),
    description: z.string().trim().max(2000).optional().nullable(),
    address: z.string().trim().max(500).optional().nullable(),
    state: z.string().trim().max(100).optional().nullable(),
    country: z.string().trim().max(100).optional().nullable(),
    phone: z.string().trim().max(50).optional().nullable(),
    email: z.string().trim().email().max(200).optional().nullable(),
  }),
  profile: z
    .object({
      firstName: z.string().trim().max(100).optional().nullable(),
      lastName: z.string().trim().max(100).optional().nullable(),
    })
    .optional(),
});

export const onboardingRouter = Router();

onboardingRouter.post(
  '/complete',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = completeOnboardingSchema.parse(req.body ?? {});

    const profileLookup = await db.query<{ organization_id: string | null }>(
      `select organization_id from public.profiles where user_id = $1 limit 1`,
      [auth.userId]
    );

    let organizationId: string | null =
      profileLookup.rows[0]?.organization_id &&
      profileLookup.rows[0].organization_id !== '00000000-0000-0000-0000-000000000000'
        ? profileLookup.rows[0].organization_id
        : auth.organizationId || null;

    const org = body.organization;

    if (organizationId) {
      const updated = await db.query<{ id: string; name: string }>(
        `update public.organizations
         set name = $1,
             type = coalesce($2, type),
             description = coalesce($3, description),
             address = coalesce($4, address),
             state = coalesce($5, state),
             country = coalesce($6, country),
             phone = coalesce($7, phone),
             email = coalesce($8, email),
             updated_at = now()
         where id = $9
         returning id, name`,
        [
          org.name,
          org.type ?? null,
          org.description ?? null,
          org.address ?? null,
          org.state ?? null,
          org.country ?? null,
          org.phone ?? null,
          org.email ?? null,
          organizationId,
        ]
      );

      if (!updated.rowCount) {
        organizationId = null;
      } else {
        organizationId = updated.rows[0].id;
      }
    }

    if (!organizationId) {
      const created = await db.query<{ id: string; name: string }>(
        `insert into public.organizations
           (name, type, description, address, state, country, phone, email, status, is_active, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, 'active', true, now(), now())
         returning id, name`,
        [
          org.name,
          org.type ?? null,
          org.description ?? null,
          org.address ?? null,
          org.state ?? null,
          org.country ?? null,
          org.phone ?? null,
          org.email ?? null,
        ]
      );
      organizationId = created.rows[0].id;
    }

    if (!organizationId) {
      throw new ApiError('Failed to create organization', 500, 'ORG_CREATE_FAILED');
    }

    await db.query(
      `update public.profiles
       set organization_id = $1,
           first_name = coalesce($2, first_name),
           last_name = coalesce($3, last_name),
           role = coalesce(role, 'admin'),
           is_organization_creator = coalesce(is_organization_creator, true),
           updated_at = now()
       where user_id = $4`,
      [organizationId, body.profile?.firstName ?? null, body.profile?.lastName ?? null, auth.userId]
    );

    await db
      .query(
        `insert into public.user_role_assignments (user_id, role_name, organization_id, assigned_by, created_at)
         values ($1, 'admin', $2, $1, now())
         on conflict do nothing`,
        [auth.userId, organizationId]
      )
      .catch(() => undefined);

    const result = await db.query<{ id: string; name: string }>(
      `select id, name from public.organizations where id = $1 limit 1`,
      [organizationId]
    );

    res.status(200).json(result.rows[0]);
  })
);
