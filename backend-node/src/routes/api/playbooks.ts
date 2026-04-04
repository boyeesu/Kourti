import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';

export const playbooksRouter = Router();

const createPlaybookSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  contractTypes: z.array(z.string()).optional(),
  rules: z.array(z.record(z.string(), z.unknown())).optional(),
  escalationConfig: z.record(z.string(), z.unknown()).optional(),
  isDefault: z.boolean().optional(),
});

// ── GET / — List playbooks ───────────────────────────────────────────

playbooksRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;

    const result = await db.query(
      `select * from negotiation_playbooks where organization_id = $1 order by is_default desc, name`,
      [organizationId]
    );

    res.json({ success: true, data: result.rows });
  })
);

// ── GET /:id — Get playbook ─────────────────────────────────────────

playbooksRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;

    const result = await db.query(
      `select * from negotiation_playbooks where id = $1 and organization_id = $2`,
      [req.params.id, organizationId]
    );

    if (!result.rows[0]) throw new ApiError('Playbook not found', 404, 'NOT_FOUND');
    res.json({ success: true, data: result.rows[0] });
  })
);

// ── POST / — Create playbook ────────────────────────────────────────

playbooksRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const body = createPlaybookSchema.parse(req.body);

    const result = await db.query(
      `insert into negotiation_playbooks
         (organization_id, name, description, contract_types, rules, escalation_config, is_default, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning *`,
      [
        organizationId,
        body.name,
        body.description ?? null,
        body.contractTypes ?? null,
        JSON.stringify(body.rules ?? []),
        body.escalationConfig ? JSON.stringify(body.escalationConfig) : null,
        body.isDefault ?? false,
        userId,
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  })
);

// ── PUT /:id — Update playbook ──────────────────────────────────────

playbooksRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const body = createPlaybookSchema.parse(req.body);

    const result = await db.query(
      `update negotiation_playbooks
       set name = $3, description = $4, contract_types = $5, rules = $6,
           escalation_config = $7, is_default = $8, updated_at = now()
       where id = $1 and organization_id = $2
       returning *`,
      [
        req.params.id,
        organizationId,
        body.name,
        body.description ?? null,
        body.contractTypes ?? null,
        JSON.stringify(body.rules ?? []),
        body.escalationConfig ? JSON.stringify(body.escalationConfig) : null,
        body.isDefault ?? false,
      ]
    );

    if (!result.rows[0]) throw new ApiError('Playbook not found', 404, 'NOT_FOUND');
    res.json({ success: true, data: result.rows[0] });
  })
);

// ── DELETE /:id — Delete playbook ───────────────────────────────────

playbooksRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;

    const result = await db.query(
      `delete from negotiation_playbooks where id = $1 and organization_id = $2 returning id`,
      [req.params.id, organizationId]
    );

    if (!result.rows[0]) throw new ApiError('Playbook not found', 404, 'NOT_FOUND');
    res.json({ success: true, data: { deleted: true } });
  })
);
