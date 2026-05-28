/**
 * Billing & trial endpoints.
 *
 * New orgs land on a 7-day Starter trial. The trial is started explicitly
 * by the client after onboarding so the user can choose between
 * "Start free trial" and "Subscribe now". The endpoint is one-shot per org —
 * once any subscription row exists for the org, /start-trial returns the
 * existing live one if any, otherwise 409 (no second trial).
 */
import { Router } from 'express';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { checkRateLimit } from '../../lib/rateLimit.js';
import { isOrgAdminOrSoleMember } from '../../services/authorization.js';
import { brevoSyncTrialStart, logBrevoError } from '../../services/brevo.js';

export const billingRouter = Router();

const TRIAL_DAYS = 7;
const PG_UNIQUE_VIOLATION = '23505';

interface SubscriptionRow {
  id: string;
  organization_id: string;
  plan_id: string | null;
  status: string;
  billing_interval: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  plan_name: string | null;
  plan_display_name: string | null;
  plan_type: string | null;
}

interface PublicSubscription {
  id: string;
  organization_id: string;
  plan_id: string | null;
  status: string;
  billing_interval: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Whitelist what we return to org members. Internal payment-provider
 * columns (`flutterwave_*`) are deliberately stripped — see security
 * audit finding #5.
 */
function publicSubscription(sub: SubscriptionRow): PublicSubscription {
  return {
    id: sub.id,
    organization_id: sub.organization_id,
    plan_id: sub.plan_id,
    status: sub.status,
    billing_interval: sub.billing_interval,
    current_period_start: sub.current_period_start,
    current_period_end: sub.current_period_end,
    trial_ends_at: sub.trial_ends_at,
    cancel_at_period_end: sub.cancel_at_period_end,
    cancelled_at: sub.cancelled_at,
    created_at: sub.created_at,
    updated_at: sub.updated_at,
  };
}

async function fetchLiveSubscription(organizationId: string): Promise<SubscriptionRow | null> {
  const result = await db.query<SubscriptionRow>(
    `select s.*, p.name as plan_name, p.display_name as plan_display_name, p.plan_type
       from public.subscriptions s
       left join public.user_plans p on p.id = s.plan_id
      where s.organization_id = $1
        and s.status in ('active','trialing','past_due')
      order by s.created_at desc
      limit 1`,
    [organizationId]
  );
  return result.rows[0] ?? null;
}

async function orgHasAnySubscription(organizationId: string): Promise<boolean> {
  const r = await db.query<{ exists: boolean }>(
    `select exists (select 1 from public.subscriptions where organization_id = $1) as exists`,
    [organizationId]
  );
  return Boolean(r.rows[0]?.exists);
}

function summarize(sub: SubscriptionRow | null) {
  if (!sub) {
    return {
      status: 'none' as const,
      is_trial: false,
      is_expired: false,
      days_remaining: 0,
      trial_ends_at: null,
      current_period_end: null,
      plan: null,
      subscription: null,
    };
  }

  const isTrial = sub.status === 'trialing';
  const endIso = isTrial ? sub.trial_ends_at : sub.current_period_end;
  const endMs = endIso ? new Date(endIso).getTime() : null;
  const nowMs = Date.now();
  const daysRemaining = endMs ? Math.max(0, Math.ceil((endMs - nowMs) / 86_400_000)) : 0;
  const isExpired = endMs != null && endMs <= nowMs;

  return {
    status: isExpired ? ('expired' as const) : (sub.status as 'active' | 'trialing' | 'past_due'),
    is_trial: isTrial,
    is_expired: isExpired,
    days_remaining: daysRemaining,
    trial_ends_at: sub.trial_ends_at,
    current_period_end: sub.current_period_end,
    plan: sub.plan_id
      ? {
          id: sub.plan_id,
          name: sub.plan_name,
          display_name: sub.plan_display_name,
          plan_type: sub.plan_type,
        }
      : null,
    subscription: publicSubscription(sub),
  };
}

billingRouter.get(
  '/trial-status',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const sub = await fetchLiveSubscription(auth.organizationId);
    res.status(200).json(summarize(sub));
  })
);

billingRouter.post(
  '/start-trial',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    // Per-user rate limit — bounds burst abuse on a brand-new org.
    const rate = checkRateLimit(`billing:start-trial:${auth.userId}`, 5, 60_000);
    res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfter));
      throw new ApiError('Too many requests. Please try again later.', 429, 'RATE_LIMIT_EXCEEDED');
    }

    // Org admin / sole-member gate — invited users can't burn the trial
    // clock on behalf of the firm.
    const allowed = await isOrgAdminOrSoleMember(auth.userId, auth.organizationId);
    if (!allowed) {
      throw new ApiError('Only an organization admin can start the trial.', 403, 'FORBIDDEN');
    }

    const existingLive = await fetchLiveSubscription(auth.organizationId);
    if (existingLive) {
      res.status(200).json({ ...summarize(existingLive), already_existed: true });
      return;
    }

    // Block re-trial: any historical sub row means the org has already
    // used its trial. Force them through the pay flow instead.
    if (await orgHasAnySubscription(auth.organizationId)) {
      throw new ApiError(
        'Your organization has already used its free trial.',
        409,
        'TRIAL_ALREADY_USED'
      );
    }

    // Deterministic plan lookup — active-only with explicit ordering.
    const plan = await db.query<{ id: string }>(
      `select id from public.user_plans
        where name = 'starter' and is_active = true
        order by created_at asc
        limit 1`
    );
    const planId = plan.rows[0]?.id ?? null;

    // Race-safe INSERT: the unique partial index uq_subscriptions_org_live
    // catches concurrent winners — fall back to re-reading the live row.
    let inserted: SubscriptionRow | null = null;
    try {
      const r = await db.query<SubscriptionRow>(
        `insert into public.subscriptions
           (organization_id, user_id, plan_id, status, billing_interval,
            current_period_start, current_period_end, trial_ends_at,
            created_at, updated_at)
         values ($1, $2, $3, 'trialing', 'monthly',
                 now(),
                 now() + make_interval(days => $4::int),
                 now() + make_interval(days => $4::int),
                 now(), now())
         returning *`,
        [auth.organizationId, auth.userId, planId, TRIAL_DAYS]
      );
      inserted = r.rows[0];
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== PG_UNIQUE_VIOLATION) throw err;
    }

    const finalSub = inserted ?? (await fetchLiveSubscription(auth.organizationId));
    const summary = summarize(finalSub);

    if (inserted) {
      void syncTrialStartToBrevo(
        auth.userId,
        auth.organizationId,
        summary.trial_ends_at,
        summary.plan?.name ?? null
      );
    }

    res.status(inserted ? 201 : 200).json({
      ...summary,
      already_existed: !inserted,
    });
  })
);

async function syncTrialStartToBrevo(
  userId: string,
  organizationId: string,
  trialEndsAt: string | null,
  plan: string | null
): Promise<void> {
  try {
    const info = await db.query<{
      email: string | null;
      first_name: string | null;
      last_name: string | null;
      firm_name: string | null;
    }>(
      `select p.email, p.first_name, p.last_name, o.name as firm_name
         from public.profiles p
         left join public.organizations o on o.id = $2
        where p.user_id = $1
        limit 1`,
      [userId, organizationId]
    );
    const row = info.rows[0];
    if (!row?.email) return;

    await brevoSyncTrialStart(row.email, {
      firstName: row.first_name,
      lastName: row.last_name,
      firmName: row.firm_name,
      organizationId,
      userId,
      trialEndsAt,
      plan,
    });
  } catch (err) {
    logBrevoError(err);
  }
}
