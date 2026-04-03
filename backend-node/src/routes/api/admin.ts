import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { asyncHandler } from '../../lib/http.js';
import { requirePlatformAdminUser } from '../../services/authorization.js';

const adminActionQuerySchema = z.object({
  admin_user_id: z.string().uuid().optional(),
  action_type: z.string().trim().optional(),
  target_type: z.string().trim().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

const logAdminActionBodySchema = z.object({
  action_type: z.string().trim().min(1),
  target_type: z.string().trim().min(1),
  target_id: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  user_agent: z.string().optional(),
});

export const adminRouter = Router();

adminRouter.get(
  '/actions',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    await requirePlatformAdminUser(auth.userId);

    const filters = adminActionQuerySchema.parse(req.query);

    const whereClauses: string[] = [];
    const values: unknown[] = [];

    if (filters.admin_user_id) {
      values.push(filters.admin_user_id);
      whereClauses.push(`admin_user_id = $${values.length}`);
    }
    if (filters.action_type) {
      values.push(filters.action_type);
      whereClauses.push(`action_type = $${values.length}`);
    }
    if (filters.target_type) {
      values.push(filters.target_type);
      whereClauses.push(`target_type = $${values.length}`);
    }
    if (filters.start_date) {
      values.push(filters.start_date);
      whereClauses.push(`created_at >= $${values.length}`);
    }
    if (filters.end_date) {
      values.push(filters.end_date);
      whereClauses.push(`created_at <= $${values.length}`);
    }

    const whereSql = whereClauses.length ? `where ${whereClauses.join(' and ')}` : '';

    const result = await db.query(
      `
      select *
      from public.admin_actions
      ${whereSql}
      order by created_at desc
      limit 1000
      `,
      values
    );

    res.status(200).json(result.rows);
  })
);

adminRouter.post(
  '/actions',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    await requirePlatformAdminUser(auth.userId);

    const parsed = logAdminActionBodySchema.parse(req.body);

    const result = await db.query(
      `
      insert into public.admin_actions (
        admin_user_id,
        action_type,
        target_type,
        target_id,
        details,
        ip_address,
        user_agent
      )
      values ($1, $2, $3, $4, $5::jsonb, $6, $7)
      returning *
      `,
      [
        auth.userId,
        parsed.action_type,
        parsed.target_type,
        parsed.target_id || null,
        JSON.stringify(parsed.details || {}),
        req.ip || null,
        parsed.user_agent || req.get('user-agent') || null,
      ]
    );

    res.status(201).json(result.rows[0]);
  })
);

adminRouter.get(
  '/subscriptions',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);

    const result = await db.query(
      `
      select
        s.id,
        s.status,
        s.billing_interval,
        up.name as plan_name,
        up.price_monthly,
        up.price_yearly,
        up.currency
      from public.subscriptions s
      left join public.user_plans up on up.id = s.plan_id
      order by s.created_at desc
      `
    );

    res.status(200).json(result.rows);
  })
);
