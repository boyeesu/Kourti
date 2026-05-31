/**
 * Platform-admin GLOBAL CASE TYPES routes.
 *
 * CRUD over the GLOBAL rows of public.case_types (organization_id NULL,
 * is_global = true). These are the matter types every firm sees in the Matter
 * Type dropdown. Reads gate on the 'platform.read' capability; mutations gate
 * on 'superadmin' and require a reason, audited via recordAdminAction with
 * before/after snapshots.
 *
 * RELATIVE paths — mount at /api/v1/admin (same as adminRouter) with the
 * `/case-types` prefix already baked into each route. The integrator adds:
 *     import { adminCaseTypesRouter } from './routes/api/adminCaseTypes.js';
 *     app.use('/api/v1/admin', requireAuth, adminCaseTypesRouter);
 *
 * Note: firm-specific case types (organization_id set) are NOT touched here —
 * those are managed per-org via /api/v1/misc/case-types.
 */
import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { recordAdminAction } from '../../services/adminAudit.js';
import { requireAdminCapabilityFor } from '../../services/authorization.js';

export const adminCaseTypesRouter = Router();

const idParam = z.object({ id: z.string().uuid() });
const reasonSchema = z.string().trim().min(3, 'A reason of at least 3 characters is required.');

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).optional(),
  is_active: z.boolean().optional().default(true),
  reason: reasonSchema,
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  is_active: z.boolean().optional(),
  reason: reasonSchema,
});

const reasonBody = z.object({ reason: reasonSchema });

interface CaseTypeRow {
  id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  is_global: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLS = `id, organization_id, name, description, is_active, is_global, created_by, created_at, updated_at`;

// ── List (all global types, including inactive) ──────────────────────────────
adminCaseTypesRouter.get(
  '/case-types',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');

    const result = await db
      .query<CaseTypeRow>(
        `select ${SELECT_COLS} from public.case_types where is_global = true order by name`
      )
      .catch(() => ({ rows: [] as CaseTypeRow[] }));

    res.status(200).json(result.rows);
  })
);

// ── Create ───────────────────────────────────────────────────────────────────
adminCaseTypesRouter.post(
  '/case-types',
  asyncHandler(async (req, res) => {
    const adminId = req.auth!.userId;
    await requireAdminCapabilityFor(adminId, 'superadmin');

    const body = createSchema.parse(req.body ?? {});

    const dup = await db.query(
      `select 1 from public.case_types where is_global = true and lower(name) = lower($1) limit 1`,
      [body.name]
    );
    if (dup.rows.length) {
      throw new ApiError('A global case type with that name already exists.', 409, 'DUPLICATE_NAME');
    }

    const result = await db.query<CaseTypeRow>(
      `insert into public.case_types (name, description, is_active, is_global, organization_id, created_by)
       values ($1, $2, $3, true, null, $4)
       returning ${SELECT_COLS}`,
      [body.name, body.description ?? null, body.is_active, adminId]
    );
    const created = result.rows[0];

    await recordAdminAction({
      adminUserId: adminId,
      actionType: 'case_type.create',
      targetType: 'case_type',
      targetId: created.id,
      reason: body.reason,
      before: null,
      after: created,
      req,
    });

    res.status(201).json(created);
  })
);

// ── Update ───────────────────────────────────────────────────────────────────
adminCaseTypesRouter.put(
  '/case-types/:id',
  asyncHandler(async (req, res) => {
    const adminId = req.auth!.userId;
    await requireAdminCapabilityFor(adminId, 'superadmin');

    const { id } = idParam.parse(req.params);
    const body = updateSchema.parse(req.body ?? {});

    const existingRes = await db.query<CaseTypeRow>(
      `select ${SELECT_COLS} from public.case_types where id = $1 and is_global = true limit 1`,
      [id]
    );
    const before = existingRes.rows[0];
    if (!before) throw new ApiError('Global case type not found.', 404, 'CASE_TYPE_NOT_FOUND');

    // Guard against renaming onto another global type's name.
    if (body.name && body.name.toLowerCase() !== before.name.toLowerCase()) {
      const dup = await db.query(
        `select 1 from public.case_types where is_global = true and lower(name) = lower($1) and id <> $2 limit 1`,
        [body.name, id]
      );
      if (dup.rows.length) {
        throw new ApiError(
          'A global case type with that name already exists.',
          409,
          'DUPLICATE_NAME'
        );
      }
    }

    const result = await db.query<CaseTypeRow>(
      `update public.case_types set
         name = coalesce($1, name),
         description = case when $2::boolean then $3 else description end,
         is_active = coalesce($4, is_active),
         updated_at = now()
       where id = $5 and is_global = true
       returning ${SELECT_COLS}`,
      [
        body.name ?? null,
        body.description !== undefined,
        body.description ?? null,
        body.is_active ?? null,
        id,
      ]
    );
    const after = result.rows[0];

    await recordAdminAction({
      adminUserId: adminId,
      actionType: 'case_type.update',
      targetType: 'case_type',
      targetId: id,
      reason: body.reason,
      before,
      after,
      req,
    });

    res.status(200).json(after);
  })
);

// ── Delete ───────────────────────────────────────────────────────────────────
adminCaseTypesRouter.delete(
  '/case-types/:id',
  asyncHandler(async (req, res) => {
    const adminId = req.auth!.userId;
    await requireAdminCapabilityFor(adminId, 'superadmin');

    const { id } = idParam.parse(req.params);
    const body = reasonBody.parse(req.body ?? {});

    const result = await db.query<CaseTypeRow>(
      `delete from public.case_types where id = $1 and is_global = true returning ${SELECT_COLS}`,
      [id]
    );
    const deleted = result.rows[0];
    if (!deleted) throw new ApiError('Global case type not found.', 404, 'CASE_TYPE_NOT_FOUND');

    await recordAdminAction({
      adminUserId: adminId,
      actionType: 'case_type.delete',
      targetType: 'case_type',
      targetId: id,
      reason: body.reason,
      before: deleted,
      after: null,
      req,
    });

    res.status(200).json({ ok: true, id });
  })
);
