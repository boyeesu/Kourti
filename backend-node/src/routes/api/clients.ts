import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';

const uuidLike = z.string().regex(/^[0-9a-fA-F-]{36}$/);

const listClientsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

const clientParamsSchema = z.object({ clientId: uuidLike });

const createClientBodySchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  company: z.string().optional(),
  notes: z.string().optional(),
  status: z.string().optional(),
});

const updateClientBodySchema = createClientBodySchema.partial();

export const clientsRouter = Router();

clientsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { page, pageSize } = listClientsQuerySchema.parse(req.query);
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      db.query(
        `select * from public.clients where organization_id = $1 order by created_at desc limit $2 offset $3`,
        [auth.organizationId, pageSize, offset]
      ),
      db.query(`select count(*)::int as total from public.clients where organization_id = $1`, [
        auth.organizationId,
      ]),
    ]);

    res.status(200).json({
      items: dataResult.rows,
      total: countResult.rows[0]?.total || 0,
    });
  })
);

clientsRouter.get(
  '/:clientId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { clientId } = clientParamsSchema.parse(req.params);

    const result = await db.query(
      'select * from public.clients where id = $1 and organization_id = $2 limit 1',
      [clientId, auth.organizationId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Client not found', 404, 'NOT_FOUND');
    }

    res.status(200).json(result.rows[0]);
  })
);

clientsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = createClientBodySchema.parse(req.body);

    const result = await db.query(
      `
      insert into public.clients (
        name, email, phone, address, company, notes, status,
        organization_id, created_by, user_id, created_at, updated_at
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,now(),now())
      returning *
      `,
      [
        body.name,
        body.email || null,
        body.phone || null,
        body.address || null,
        body.company || null,
        body.notes || null,
        body.status || 'active',
        auth.organizationId,
        auth.userId,
      ]
    );

    res.status(201).json(result.rows[0]);
  })
);

clientsRouter.patch(
  '/:clientId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { clientId } = clientParamsSchema.parse(req.params);
    const body = updateClientBodySchema.parse(req.body);

    const updates: Array<{ col: string; val: unknown }> = [];
    if (body.name !== undefined) updates.push({ col: 'name', val: body.name });
    if (body.email !== undefined) updates.push({ col: 'email', val: body.email });
    if (body.phone !== undefined) updates.push({ col: 'phone', val: body.phone });
    if (body.address !== undefined) updates.push({ col: 'address', val: body.address });
    if (body.company !== undefined) updates.push({ col: 'company', val: body.company });
    if (body.notes !== undefined) updates.push({ col: 'notes', val: body.notes });
    if (body.status !== undefined) updates.push({ col: 'status', val: body.status });

    if (!updates.length) {
      throw new ApiError('No update fields provided', 400, 'VALIDATION_ERROR');
    }

    const setClause = updates.map((u, i) => `${u.col} = $${i + 1}`).join(', ');
    const values = updates.map((u) => u.val);

    const result = await db.query(
      `update public.clients set ${setClause}, updated_at = now() where id = $${values.length + 1} and organization_id = $${values.length + 2} returning *`,
      [...values, clientId, auth.organizationId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Client not found', 404, 'NOT_FOUND');
    }

    res.status(200).json(result.rows[0]);
  })
);

clientsRouter.delete(
  '/:clientId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { clientId } = clientParamsSchema.parse(req.params);

    const result = await db.query(
      'delete from public.clients where id = $1 and organization_id = $2 returning id',
      [clientId, auth.organizationId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Client not found', 404, 'NOT_FOUND');
    }

    res.status(204).send();
  })
);
