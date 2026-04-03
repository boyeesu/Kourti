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

// ── User plan assignments ───────────────────────────────────────────────────

adminRouter.get(
  '/user-plan-assignments',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);

    const result = await db
      .query(
        `SELECT upa.*, up.name as plan_name, up.display_name as plan_display_name,
              au.email as user_email
       FROM public.user_plan_assignments upa
       LEFT JOIN public.user_plans up ON up.id = upa.plan_id
       LEFT JOIN public.auth_users au ON au.id = upa.user_id
       ORDER BY upa.created_at DESC`
      )
      .catch(() => ({ rows: [] }));

    res.status(200).json(result.rows);
  })
);

adminRouter.post(
  '/user-plans/assign',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);
    const body = z
      .object({
        userId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
        planId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
        notes: z.string().optional(),
      })
      .parse(req.body);

    const result = await db.query(
      `INSERT INTO public.user_plan_assignments (user_id, plan_id, assigned_by, status, starts_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'active', now(), now(), now())
       RETURNING *`,
      [body.userId, body.planId, req.auth!.userId]
    );

    res.status(201).json(result.rows[0]);
  })
);

adminRouter.post(
  '/user-plans/revoke',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);
    const body = z
      .object({
        userId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
      })
      .parse(req.body);

    await db.query(
      `UPDATE public.user_plan_assignments SET status = 'revoked', updated_at = now() WHERE user_id = $1 AND status = 'active'`,
      [body.userId]
    );

    res.status(200).json({ ok: true });
  })
);

// ── Plans management ────────────────────────────────────────────────────────

adminRouter.get(
  '/plans',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);

    const result = await db
      .query('SELECT * FROM public.user_plans ORDER BY plan_type ASC')
      .catch(() => ({ rows: [] }));

    res.status(200).json(result.rows);
  })
);

adminRouter.put(
  '/plans/prices',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);
    const body = z
      .object({
        planId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
        price_monthly: z.number().optional(),
        price_yearly: z.number().optional(),
      })
      .parse(req.body);

    await db.query(
      `UPDATE public.user_plans SET
         price_monthly = COALESCE($1, price_monthly),
         price_yearly = COALESCE($2, price_yearly),
         updated_at = now()
       WHERE id = $3`,
      [body.price_monthly, body.price_yearly, body.planId]
    );

    res.status(200).json({ ok: true });
  })
);

adminRouter.post(
  '/plans/sync-flutterwave',
  asyncHandler(async (_req, res) => {
    // Placeholder -- Flutterwave sync to be implemented with provider integration
    res.status(202).json({ ok: true, message: 'Sync queued' });
  })
);

// ── User management (approve, disable, delete) ─────────────────────────────

adminRouter.post(
  '/users/:userId/approve',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);
    const { userId } = z
      .object({ userId: z.string().regex(/^[0-9a-fA-F-]{36}$/) })
      .parse(req.params);

    await db.query(
      `UPDATE public.profiles SET status = 'active', approved_at = now(), approved_by = $1, updated_at = now() WHERE user_id = $2`,
      [req.auth!.userId, userId]
    );
    await db.query(
      `UPDATE public.auth_users SET is_active = true, updated_at = now() WHERE id = $1`,
      [userId]
    );

    res.status(200).json({ ok: true });
  })
);

adminRouter.post(
  '/users/:userId/disable',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);
    const { userId } = z
      .object({ userId: z.string().regex(/^[0-9a-fA-F-]{36}$/) })
      .parse(req.params);
    const body = z.object({ reason: z.string().optional() }).parse(req.body);

    await db.query(
      `UPDATE public.profiles SET status = 'disabled', disabled_at = now(), disabled_by = $1, updated_at = now() WHERE user_id = $2`,
      [req.auth!.userId, userId]
    );
    await db.query(
      `UPDATE public.auth_users SET is_active = false, refresh_token = NULL, updated_at = now() WHERE id = $1`,
      [userId]
    );

    res.status(200).json({ ok: true });
  })
);

adminRouter.post(
  '/users/:userId/delete',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);
    const { userId } = z
      .object({ userId: z.string().regex(/^[0-9a-fA-F-]{36}$/) })
      .parse(req.params);

    // Soft delete: disable and mark
    await db.query(
      `UPDATE public.profiles SET status = 'deleted', disabled_at = now(), disabled_by = $1, updated_at = now() WHERE user_id = $2`,
      [req.auth!.userId, userId]
    );
    await db.query(
      `UPDATE public.auth_users SET is_active = false, refresh_token = NULL, updated_at = now() WHERE id = $1`,
      [userId]
    );

    res.status(200).json({ ok: true });
  })
);

adminRouter.post(
  '/organizations',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);
    const body = z
      .object({
        name: z.string().trim().min(1),
        email: z.string().email().optional(),
        description: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        website: z.string().optional(),
      })
      .parse(req.body);

    const result = await db.query(
      `INSERT INTO public.organizations (name, email, description, address, phone, website, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now(), now())
       RETURNING id`,
      [
        body.name,
        body.email || null,
        body.description || null,
        body.address || null,
        body.phone || null,
        body.website || null,
      ]
    );

    res.status(201).json(result.rows[0]?.id || null);
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
