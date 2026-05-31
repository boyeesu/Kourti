/**
 * Platform-admin BILLING OPERATIONS module.
 *
 * Sibling of routes/api/admin.ts (which owns /subscriptions, /organizations,
 * /organizations/:orgId/plan|assign-plan|revoke-plan, /plans, /user-plans).
 * This module owns the operational billing surface under a `/billing/...`
 * prefix plus a handful of per-org billing endpoints:
 *
 *   GET  /billing/reconciliation
 *   GET  /billing/dunning
 *   GET  /organizations/:orgId/seat-usage
 *   GET  /organizations/:orgId/billing
 *   POST /organizations/:orgId/credits
 *   POST /organizations/:orgId/subscription-adjustments
 *
 * Mounted (relative) under /api/v1/admin alongside adminRouter, after
 * requireAuth — same convention as adminHealth / adminUsage / adminKb:
 *
 *   app.use('/api/v1/admin', requireAuth, adminBillingRouter);
 *
 * Read endpoints gate on 'platform.read'; mutating endpoints gate on
 * 'billing.manage' and require a `reason` (audited via recordAdminAction).
 */
import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { recordAdminAction } from '../../services/adminAudit.js';
import { requireAdminCapabilityFor } from '../../services/authorization.js';

export const adminBillingRouter = Router();

const orgIdParam = z.object({ orgId: z.string().regex(/^[0-9a-fA-F-]{36}$/) });
const reasonSchema = z.string().trim().min(3, 'A reason (min 3 chars) is required.');

/**
 * Best-effort check for a "seats" / "quantity" column on subscriptions. The
 * current schema ships `subscriptions.seats` (seat-based billing), but older
 * environments may not have it yet, so we probe information_schema and cache
 * the answer for the process lifetime. Returns the column name to use, or null
 * if neither exists.
 */
let seatColumnCache: string | null | undefined;
async function resolveSeatColumn(): Promise<string | null> {
  if (seatColumnCache !== undefined) return seatColumnCache;
  const res = await db
    .query<{ column_name: string }>(
      `select column_name
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'subscriptions'
          and column_name in ('seats','quantity')`
    )
    .catch(() => ({ rows: [] as { column_name: string }[] }));
  const names = res.rows.map((r) => r.column_name);
  // Prefer 'seats' (the canonical seat-based-billing column) over 'quantity'.
  seatColumnCache = names.includes('seats')
    ? 'seats'
    : names.includes('quantity')
      ? 'quantity'
      : null;
  return seatColumnCache;
}

// ── GET /billing/reconciliation ──────────────────────────────────────────────
// Orgs where a manual plan grant (active user_plan_assignments) diverges from
// the live subscriptions row: either a manual grant exists with no active sub,
// or the active sub's plan differs from the granted plan.
adminBillingRouter.get(
  '/billing/reconciliation',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');

    const result = await db
      .query(
        `
        with grants as (
          -- One representative active grant per org (latest-starting).
          select distinct on (upa.organization_id)
                 upa.organization_id,
                 upa.plan_id,
                 upa.starts_at
            from public.user_plan_assignments upa
           where upa.status = 'active'
             and upa.organization_id is not null
           order by upa.organization_id, upa.starts_at desc
        ),
        live_subs as (
          -- The org's live (active/trialing/past_due) subscription, if any.
          select distinct on (s.organization_id)
                 s.organization_id,
                 s.id as subscription_id,
                 s.plan_id as sub_plan_id,
                 s.status as sub_status
            from public.subscriptions s
           where s.organization_id is not null
             and s.status in ('active','trialing','past_due')
           order by s.organization_id, s.created_at desc
        )
        select
          o.id   as organization_id,
          o.name as organization_name,
          g.plan_id                       as granted_plan_id,
          gp.display_name                 as granted_plan_name,
          ls.subscription_id              as subscription_id,
          ls.sub_plan_id                  as subscription_plan_id,
          sp.display_name                 as subscription_plan_name,
          ls.sub_status                   as subscription_status,
          case
            when ls.organization_id is null then 'grant_without_active_subscription'
            else 'plan_mismatch'
          end as divergence_reason
        from grants g
        join public.organizations o on o.id = g.organization_id
        left join public.user_plans gp on gp.id = g.plan_id
        left join live_subs ls on ls.organization_id = g.organization_id
        left join public.user_plans sp on sp.id = ls.sub_plan_id
        where ls.organization_id is null
           or ls.sub_plan_id is distinct from g.plan_id
        order by o.name asc
        limit 500
        `
      )
      .catch(() => ({ rows: [] }));

    res.status(200).json(result.rows);
  })
);

// ── GET /billing/dunning ─────────────────────────────────────────────────────
// Failed-payment / at-risk queue: subscriptions past_due/unpaid OR set to
// cancel at period end, joined to their organization.
adminBillingRouter.get(
  '/billing/dunning',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');

    const result = await db
      .query(
        `
        select
          s.id                    as subscription_id,
          s.organization_id,
          o.name                  as organization_name,
          s.status,
          s.billing_interval,
          s.cancel_at_period_end,
          s.current_period_end,
          s.provider,
          s.provider_customer_email,
          up.display_name         as plan_display_name,
          up.currency
        from public.subscriptions s
        left join public.organizations o on o.id = s.organization_id
        left join public.user_plans up on up.id = s.plan_id
        where s.status in ('past_due','unpaid')
           or s.cancel_at_period_end = true
        order by s.current_period_end asc nulls last
        limit 500
        `
      )
      .catch(() => ({ rows: [] }));

    res.status(200).json(result.rows);
  })
);

// ── GET /organizations/:orgId/seat-usage ─────────────────────────────────────
// purchased = seats/quantity from the org's live subscription (null if no such
// column / no live sub); used = active member profiles in the org.
adminBillingRouter.get(
  '/organizations/:orgId/seat-usage',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');
    const { orgId } = orgIdParam.parse(req.params);

    const seatCol = await resolveSeatColumn();

    let purchased: number | null = null;
    if (seatCol) {
      const subRes = await db
        .query<{ purchased: number | null }>(
          `select ${seatCol} as purchased
             from public.subscriptions
            where organization_id = $1
              and status in ('active','trialing','past_due')
            order by created_at desc
            limit 1`,
          [orgId]
        )
        .catch(() => ({ rows: [] as { purchased: number | null }[] }));
      purchased = subRes.rows[0]?.purchased ?? null;
    }

    const usedRes = await db
      .query<{ used: string }>(
        `select count(*)::text as used
           from public.profiles
          where organization_id = $1
            and coalesce(status, 'active') not in ('disabled','deleted')`,
        [orgId]
      )
      .catch(() => ({ rows: [{ used: '0' }] }));

    res.status(200).json({
      purchased: purchased == null ? null : Number(purchased),
      used: Number(usedRes.rows[0]?.used ?? '0'),
    });
  })
);

// ── GET /organizations/:orgId/billing ────────────────────────────────────────
// Active subscription + net credit balance + recent adjustments & credits.
adminBillingRouter.get(
  '/organizations/:orgId/billing',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');
    const { orgId } = orgIdParam.parse(req.params);

    const subRes = await db
      .query(
        `
        select
          s.id,
          s.plan_id,
          s.status,
          s.billing_interval,
          s.current_period_start,
          s.current_period_end,
          s.trial_ends_at,
          s.cancel_at_period_end,
          s.provider,
          s.provider_customer_email,
          up.display_name as plan_display_name,
          up.name as plan_name,
          up.currency
        from public.subscriptions s
        left join public.user_plans up on up.id = s.plan_id
        where s.organization_id = $1
          and s.status in ('active','trialing','past_due')
        order by s.created_at desc
        limit 1
        `,
        [orgId]
      )
      .catch(() => ({ rows: [] }));

    const creditBalanceRes = await db
      .query<{ net_minor: string | null; currency: string | null }>(
        `select coalesce(sum(amount_minor), 0)::text as net_minor,
                max(currency) as currency
           from public.billing_credits
          where organization_id = $1`,
        [orgId]
      )
      .catch(() => ({ rows: [{ net_minor: '0', currency: null }] }));

    const adjustmentsRes = await db
      .query(
        `select id, subscription_id, adjustment_type, params, reason, created_by, created_at
           from public.subscription_adjustments
          where organization_id = $1
          order by created_at desc
          limit 20`,
        [orgId]
      )
      .catch(() => ({ rows: [] }));

    const creditsRes = await db
      .query(
        `select id, amount_minor, currency, reason, created_by, created_at
           from public.billing_credits
          where organization_id = $1
          order by created_at desc
          limit 20`,
        [orgId]
      )
      .catch(() => ({ rows: [] }));

    res.status(200).json({
      subscription: subRes.rows[0] ?? null,
      net_credit_minor: Number(creditBalanceRes.rows[0]?.net_minor ?? '0'),
      credit_currency: creditBalanceRes.rows[0]?.currency ?? null,
      adjustments: adjustmentsRes.rows,
      credits: creditsRes.rows,
    });
  })
);

// ── POST /organizations/:orgId/credits ───────────────────────────────────────
// Grant (or claw back, if negative) a manual billing credit. Audited.
adminBillingRouter.post(
  '/organizations/:orgId/credits',
  asyncHandler(async (req, res) => {
    const adminId = req.auth!.userId;
    await requireAdminCapabilityFor(adminId, 'billing.manage');
    const { orgId } = orgIdParam.parse(req.params);
    const body = z
      .object({
        amountMinor: z.number().int(),
        currency: z
          .string()
          .trim()
          .regex(/^[A-Za-z]{3}$/, 'Currency must be a 3-letter code')
          .transform((c) => c.toUpperCase())
          .optional()
          .default('NGN'),
        reason: reasonSchema,
      })
      .parse(req.body ?? {});

    // Org must exist.
    const orgRes = await db.query<{ id: string }>(
      `select id from public.organizations where id = $1 limit 1`,
      [orgId]
    );
    if (!orgRes.rows[0]) throw new ApiError('Organization not found.', 404, 'ORG_NOT_FOUND');

    const inserted = await db.query(
      `insert into public.billing_credits
         (organization_id, amount_minor, currency, reason, created_by)
       values ($1, $2, $3, $4, $5)
       returning id, organization_id, amount_minor, currency, reason, created_by, created_at`,
      [orgId, body.amountMinor, body.currency, body.reason, adminId]
    );
    const credit = inserted.rows[0];

    await recordAdminAction({
      adminUserId: adminId,
      actionType: 'billing_credit_granted',
      targetType: 'organization',
      targetId: orgId,
      reason: body.reason,
      after: credit,
      details: { amount_minor: body.amountMinor, currency: body.currency },
      req,
    });

    res.status(201).json(credit);
  })
);

// ── POST /organizations/:orgId/subscription-adjustments ──────────────────────
// Record a discrete billing adjustment against the org's live subscription and,
// where the adjustment is mechanical (extend_trial / change_seats), apply it.
const adjustmentBody = z.object({
  adjustmentType: z.enum([
    'extend_trial',
    'change_seats',
    'force_sync',
    'mark_paid',
    'cancel',
    'reactivate',
  ]),
  params: z.record(z.string(), z.unknown()).optional().default({}),
  reason: reasonSchema,
});

adminBillingRouter.post(
  '/organizations/:orgId/subscription-adjustments',
  asyncHandler(async (req, res) => {
    const adminId = req.auth!.userId;
    await requireAdminCapabilityFor(adminId, 'billing.manage');
    const { orgId } = orgIdParam.parse(req.params);
    const body = adjustmentBody.parse(req.body ?? {});

    // Org must exist.
    const orgRes = await db.query<{ id: string }>(
      `select id from public.organizations where id = $1 limit 1`,
      [orgId]
    );
    if (!orgRes.rows[0]) throw new ApiError('Organization not found.', 404, 'ORG_NOT_FOUND');

    // The org's live subscription (if any). before/after snapshots in the audit.
    const beforeRes = await db
      .query(
        `select * from public.subscriptions
          where organization_id = $1
            and status in ('active','trialing','past_due')
          order by created_at desc
          limit 1`,
        [orgId]
      )
      .catch(() => ({ rows: [] as Record<string, unknown>[] }));
    const before = beforeRes.rows[0] ?? null;
    const subscriptionId = (before?.id as string | undefined) ?? null;

    // Apply mechanical adjustments where we safely can. Column-absence and
    // other apply failures are caught so the adjustment is still recorded.
    let applied = false;
    let applyError: string | null = null;

    try {
      if (body.adjustmentType === 'extend_trial' && subscriptionId) {
        const daysRaw = (body.params as Record<string, unknown>).days;
        const days = Number(daysRaw);
        if (!Number.isInteger(days) || days <= 0) {
          throw new ApiError('params.days must be a positive integer.', 400, 'INVALID_PARAMS');
        }
        await db.query(
          `update public.subscriptions
              set current_period_end = coalesce(current_period_end, now())
                                       + make_interval(days => $2::int),
                  updated_at = now()
            where id = $1`,
          [subscriptionId, days]
        );
        applied = true;
      } else if (body.adjustmentType === 'change_seats' && subscriptionId) {
        const seatsRaw = (body.params as Record<string, unknown>).seats;
        const seats = Number(seatsRaw);
        if (!Number.isInteger(seats) || seats < 0) {
          throw new ApiError('params.seats must be a non-negative integer.', 400, 'INVALID_PARAMS');
        }
        const seatCol = await resolveSeatColumn();
        if (seatCol) {
          await db.query(
            `update public.subscriptions set ${seatCol} = $2, updated_at = now() where id = $1`,
            [subscriptionId, seats]
          );
          applied = true;
        } else {
          applyError = 'No seats/quantity column on subscriptions; recorded without applying.';
        }
      }
      // force_sync / mark_paid / cancel / reactivate are recorded as intent
      // only here — provider reconciliation / state machine lives elsewhere.
    } catch (err) {
      if (err instanceof ApiError) throw err; // validation errors should 400
      // Column-absence or other DB errors: record the adjustment regardless.
      applyError = err instanceof Error ? err.message : String(err);
    }

    // Read the post-apply subscription row for the audit after-state.
    let after: Record<string, unknown> | null = before;
    if (applied && subscriptionId) {
      const afterRes = await db
        .query(`select * from public.subscriptions where id = $1 limit 1`, [subscriptionId])
        .catch(() => ({ rows: [before] as Record<string, unknown>[] }));
      after = afterRes.rows[0] ?? before;
    }

    const inserted = await db.query(
      `insert into public.subscription_adjustments
         (organization_id, subscription_id, adjustment_type, params, reason, created_by)
       values ($1, $2, $3, $4::jsonb, $5, $6)
       returning id, organization_id, subscription_id, adjustment_type, params, reason, created_by, created_at`,
      [
        orgId,
        subscriptionId,
        body.adjustmentType,
        JSON.stringify(body.params ?? {}),
        body.reason,
        adminId,
      ]
    );
    const adjustment = inserted.rows[0];

    await recordAdminAction({
      adminUserId: adminId,
      actionType: 'subscription_adjustment',
      targetType: 'subscription',
      targetId: subscriptionId ?? orgId,
      reason: body.reason,
      before,
      after,
      details: {
        organization_id: orgId,
        adjustment_type: body.adjustmentType,
        params: body.params,
        applied,
        apply_error: applyError,
      },
      req,
    });

    res.status(201).json({ ...adjustment, applied, apply_error: applyError });
  })
);
