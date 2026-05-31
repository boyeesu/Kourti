/**
 * Platform-admin LIFECYCLE AUTOMATION RULES routes.
 *
 * CRUD over public.admin_lifecycle_rules plus manual run triggers. Reads gate on
 * the 'platform.read' capability; mutations gate on 'rules.manage' and require a
 * reason, audited via recordAdminAction with before/after snapshots.
 *
 * RELATIVE paths — mount at /api/v1/admin (same as adminRouter) with the
 * `/rules` prefix already baked into each route. The integrator adds:
 *     import { adminRulesRouter } from './routes/api/adminRules.js';
 *     app.use('/api/v1/admin', requireAuth, adminRulesRouter);
 */
import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { recordAdminAction } from '../../services/adminAudit.js';
import {
  loadRule,
  runLifecycleRules,
  runSingleRule,
  TRIGGER_ACTIONS,
  type LifecycleAction,
  type LifecycleTrigger,
} from '../../services/adminRules.js';
import { requireAdminCapabilityFor } from '../../services/authorization.js';

export const adminRulesRouter = Router();

const TRIGGERS = ['user_signup', 'dormant_account', 'trial_expiring'] as const;
const ACTIONS = ['auto_approve', 'flag', 'auto_disable', 'notify'] as const;

const idParam = z.object({ id: z.string().uuid() });
const reasonSchema = z.string().trim().min(3, 'A reason of at least 3 characters is required.');

/** Validate that the chosen action is compatible with the chosen trigger. */
function assertCompatible(trigger: LifecycleTrigger, action: LifecycleAction): void {
  const allowed = TRIGGER_ACTIONS[trigger];
  if (!allowed.includes(action)) {
    throw new ApiError(
      `Action '${action}' is not valid for trigger '${trigger}'. Allowed: ${allowed.join(', ')}.`,
      400,
      'INCOMPATIBLE_ACTION'
    );
  }
}

const paramsSchema = z.record(z.string(), z.unknown());

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  trigger: z.enum(TRIGGERS),
  action: z.enum(ACTIONS),
  params: paramsSchema.optional().default({}),
  enabled: z.boolean().optional().default(true),
  reason: reasonSchema,
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  trigger: z.enum(TRIGGERS).optional(),
  action: z.enum(ACTIONS).optional(),
  params: paramsSchema.optional(),
  enabled: z.boolean().optional(),
  reason: reasonSchema,
});

const reasonBody = z.object({ reason: reasonSchema });

interface RuleRow {
  id: string;
  name: string;
  trigger: LifecycleTrigger;
  action: LifecycleAction;
  params: Record<string, unknown>;
  enabled: boolean;
  created_by: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLS = `id, name, trigger, action, params, enabled, created_by, last_run_at, created_at, updated_at`;

// ── List ────────────────────────────────────────────────────────────────────
adminRulesRouter.get(
  '/rules',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');

    const result = await db
      .query<RuleRow>(
        `select ${SELECT_COLS} from public.admin_lifecycle_rules order by created_at desc`
      )
      .catch(() => ({ rows: [] as RuleRow[] }));

    res.status(200).json(result.rows);
  })
);

// ── Create ──────────────────────────────────────────────────────────────────
adminRulesRouter.post(
  '/rules',
  asyncHandler(async (req, res) => {
    const adminId = req.auth!.userId;
    await requireAdminCapabilityFor(adminId, 'rules.manage');

    const body = createSchema.parse(req.body ?? {});
    assertCompatible(body.trigger, body.action);

    const result = await db.query<RuleRow>(
      `insert into public.admin_lifecycle_rules (name, trigger, action, params, enabled, created_by)
       values ($1, $2, $3, $4::jsonb, $5, $6)
       returning ${SELECT_COLS}`,
      [
        body.name,
        body.trigger,
        body.action,
        JSON.stringify(body.params ?? {}),
        body.enabled,
        adminId,
      ]
    );
    const created = result.rows[0];

    await recordAdminAction({
      adminUserId: adminId,
      actionType: 'rule.create',
      targetType: 'lifecycle_rule',
      targetId: created.id,
      reason: body.reason,
      before: null,
      after: created,
      req,
    });

    res.status(201).json(created);
  })
);

// ── Update ──────────────────────────────────────────────────────────────────
adminRulesRouter.put(
  '/rules/:id',
  asyncHandler(async (req, res) => {
    const adminId = req.auth!.userId;
    await requireAdminCapabilityFor(adminId, 'rules.manage');

    const { id } = idParam.parse(req.params);
    const body = updateSchema.parse(req.body ?? {});

    const existingRes = await db.query<RuleRow>(
      `select ${SELECT_COLS} from public.admin_lifecycle_rules where id = $1 limit 1`,
      [id]
    );
    const before = existingRes.rows[0];
    if (!before) throw new ApiError('Rule not found.', 404, 'RULE_NOT_FOUND');

    // Resolve effective trigger/action after the patch, then validate the pair.
    const nextTrigger = (body.trigger ?? before.trigger) as LifecycleTrigger;
    const nextAction = (body.action ?? before.action) as LifecycleAction;
    assertCompatible(nextTrigger, nextAction);

    const result = await db.query<RuleRow>(
      `update public.admin_lifecycle_rules set
         name = coalesce($1, name),
         trigger = coalesce($2, trigger),
         action = coalesce($3, action),
         params = coalesce($4::jsonb, params),
         enabled = coalesce($5, enabled),
         updated_at = now()
       where id = $6
       returning ${SELECT_COLS}`,
      [
        body.name ?? null,
        body.trigger ?? null,
        body.action ?? null,
        body.params === undefined ? null : JSON.stringify(body.params),
        body.enabled ?? null,
        id,
      ]
    );
    const after = result.rows[0];

    await recordAdminAction({
      adminUserId: adminId,
      actionType: 'rule.update',
      targetType: 'lifecycle_rule',
      targetId: id,
      reason: body.reason,
      before,
      after,
      req,
    });

    res.status(200).json(after);
  })
);

// ── Delete ──────────────────────────────────────────────────────────────────
adminRulesRouter.delete(
  '/rules/:id',
  asyncHandler(async (req, res) => {
    const adminId = req.auth!.userId;
    await requireAdminCapabilityFor(adminId, 'rules.manage');

    const { id } = idParam.parse(req.params);
    const body = reasonBody.parse(req.body ?? {});

    const result = await db.query<RuleRow>(
      `delete from public.admin_lifecycle_rules where id = $1 returning ${SELECT_COLS}`,
      [id]
    );
    const deleted = result.rows[0];
    if (!deleted) throw new ApiError('Rule not found.', 404, 'RULE_NOT_FOUND');

    await recordAdminAction({
      adminUserId: adminId,
      actionType: 'rule.delete',
      targetType: 'lifecycle_rule',
      targetId: id,
      reason: body.reason,
      before: deleted,
      after: null,
      req,
    });

    res.status(200).json({ ok: true, id });
  })
);

// ── Run one rule now ─────────────────────────────────────────────────────────
adminRulesRouter.post(
  '/rules/:id/run',
  asyncHandler(async (req, res) => {
    const adminId = req.auth!.userId;
    await requireAdminCapabilityFor(adminId, 'rules.manage');

    const { id } = idParam.parse(req.params);
    const body = reasonBody.parse(req.body ?? {});

    const rule = await loadRule(id);
    if (!rule) throw new ApiError('Rule not found.', 404, 'RULE_NOT_FOUND');

    const affected = await runSingleRule(rule);

    await recordAdminAction({
      adminUserId: adminId,
      actionType: 'rule.run',
      targetType: 'lifecycle_rule',
      targetId: id,
      reason: body.reason,
      details: { affected, trigger: rule.trigger, action: rule.action, manual: true },
      req,
    });

    res.status(200).json({ ok: true, ruleId: id, action: rule.action, affected });
  })
);

// ── Run all enabled rules now ────────────────────────────────────────────────
adminRulesRouter.post(
  '/rules/run-all',
  asyncHandler(async (req, res) => {
    const adminId = req.auth!.userId;
    await requireAdminCapabilityFor(adminId, 'superadmin');

    const body = reasonBody.parse(req.body ?? {});

    const summary = await runLifecycleRules();
    const totalAffected = summary.reduce((acc, r) => acc + r.affected, 0);

    await recordAdminAction({
      adminUserId: adminId,
      actionType: 'rule.run_all',
      targetType: 'lifecycle_rule',
      targetId: null,
      reason: body.reason,
      details: { rules: summary.length, totalAffected, summary, manual: true },
      req,
    });

    res.status(200).json({ ok: true, rules: summary.length, totalAffected, summary });
  })
);
