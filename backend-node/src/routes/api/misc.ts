/**
 * Miscellaneous endpoints for smaller domains:
 * activity types, client logs, dashboard prefs, saved searches,
 * bulk actions, contract templates, onboarding, voice transcriptions,
 * subscriptions, user plans.
 */
import { Router } from 'express';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { checkRateLimit } from '../../lib/rateLimit.js';
import { isPlatformAdminUser, isOrgAdminOrSoleMember } from '../../services/authorization.js';
import { getUsdNgnRate } from '../../services/fx.js';
import {
  generateTxRef,
  initializeTransaction,
  isPaystackConfigured,
  verifyTransaction,
} from '../../services/paystack.js';
import { activateSubscriptionFromTx } from '../../services/subscriptionActivation.js';

const uuidLike = z.string().regex(/^[0-9a-fA-F-]{36}$/);

/**
 * Convert the plan's display price into what we'll actually charge
 * through Paystack. Same-currency → no-op. USD → NGN: applies the live
 * FX rate (cached, with env fallback) plus `USD_NGN_MARKUP_BPS` of
 * buffer. Anything else throws — add an explicit conversion or change
 * `PAYSTACK_CURRENCY` rather than silently mis-charging.
 */
async function convertForPaystack(planAmount: number, planCurrency: string) {
  const display = planCurrency.toUpperCase();
  const settle = env.PAYSTACK_CURRENCY.toUpperCase();

  if (display === settle) {
    return {
      displayAmount: planAmount,
      displayCurrency: display,
      chargedAmount: Math.round(planAmount * 100) / 100,
      chargedCurrency: settle,
      fxRate: 1,
      fxSource: 'identity' as const,
    };
  }

  if (display === 'USD' && settle === 'NGN') {
    const fx = await getUsdNgnRate();
    const rateWithMarkup = fx.rate * (1 + env.USD_NGN_MARKUP_BPS / 10_000);
    const charged = Math.round(planAmount * rateWithMarkup * 100) / 100;
    return {
      displayAmount: planAmount,
      displayCurrency: 'USD',
      chargedAmount: charged,
      chargedCurrency: 'NGN',
      fxRate: rateWithMarkup,
      fxSource: fx.source as string,
    };
  }

  throw new ApiError(
    `No FX configured to convert ${display} → ${settle}.`,
    501,
    'FX_NOT_CONFIGURED'
  );
}

export const miscRouter = Router();

// ── Activity types ──────────────────────────────────────────────────────────

miscRouter.get(
  '/activity-types',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db
      .query(
        `select distinct activity_type from public.case_activities where activity_type is not null and organization_id = $1`,
        [auth.organizationId]
      )
      .catch(() => ({ rows: [] }));

    res
      .status(200)
      .json(result.rows.map((r: Record<string, unknown>) => r.activity_type as string));
  })
);

// ── Client logs ─────────────────────────────────────────────────────────────

miscRouter.get(
  '/client-logs/:clientId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { clientId } = z.object({ clientId: uuidLike }).parse(req.params);

    const result = await db.query(
      `select * from public.communication_logs where client_id = $1 and organization_id = $2 order by created_at desc`,
      [clientId, auth.organizationId]
    );

    res.status(200).json(result.rows);
  })
);

miscRouter.post(
  '/client-logs',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = z
      .object({
        client_id: uuidLike,
        type: z.string().trim().min(1),
        content: z.string().trim().min(1),
      })
      .parse(req.body);

    const result = await db.query(
      `insert into public.communication_logs (client_id, user_id, organization_id, type, content, created_at) values ($1,$2,$3,$4,$5,now()) returning *`,
      [body.client_id, auth.userId, auth.organizationId, body.type, body.content]
    );

    res.status(201).json(result.rows[0]);
  })
);

// ── Dashboard prefs ─────────────────────────────────────────────────────────

miscRouter.get(
  '/dashboard-prefs',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db
      .query(
        `select * from public.dashboard_prefs where user_id = $1 and organization_id = $2 limit 1`,
        [auth.userId, auth.organizationId]
      )
      .catch(() => ({ rows: [] }));

    res.status(200).json(
      result.rows[0] ?? {
        show_upcoming_cases: true,
        show_upcoming_contracts: true,
        reminder_window_days: 90,
      }
    );
  })
);

miscRouter.put(
  '/dashboard-prefs',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = z
      .object({
        show_upcoming_cases: z.boolean().optional(),
        show_upcoming_contracts: z.boolean().optional(),
        reminder_window_days: z.number().int().optional(),
      })
      .parse(req.body);

    const result = await db
      .query(
        `insert into public.dashboard_prefs (user_id, organization_id, show_upcoming_cases, show_upcoming_contracts, reminder_window_days)
       values ($1, $2, $3, $4, $5)
       on conflict (user_id, organization_id) do update set
         show_upcoming_cases = coalesce(excluded.show_upcoming_cases, public.dashboard_prefs.show_upcoming_cases),
         show_upcoming_contracts = coalesce(excluded.show_upcoming_contracts, public.dashboard_prefs.show_upcoming_contracts),
         reminder_window_days = coalesce(excluded.reminder_window_days, public.dashboard_prefs.reminder_window_days)
       returning *`,
        [
          auth.userId,
          auth.organizationId,
          body.show_upcoming_cases ?? true,
          body.show_upcoming_contracts ?? true,
          body.reminder_window_days ?? 90,
        ]
      )
      .catch(() => ({ rows: [body] }));

    res.status(200).json(result.rows[0]);
  })
);

// ── Saved searches ──────────────────────────────────────────────────────────

miscRouter.get(
  '/saved-searches',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db
      .query(
        `select * from public.saved_searches where organization_id = $1 order by created_at desc`,
        [auth.organizationId]
      )
      .catch(() => ({ rows: [] }));

    res.status(200).json(result.rows);
  })
);

miscRouter.post(
  '/saved-searches',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = z
      .object({
        name: z.string().trim().min(1),
        query: z.string(),
        filters: z.record(z.string(), z.unknown()).default({}),
        resource_type: z.enum(['cases', 'documents', 'clients', 'contracts']),
      })
      .parse(req.body);

    const result = await db.query(
      `insert into public.saved_searches (organization_id, name, query, filters, resource_type, created_at) values ($1,$2,$3,$4,$5,now()) returning *`,
      [auth.organizationId, body.name, body.query, JSON.stringify(body.filters), body.resource_type]
    );

    res.status(201).json(result.rows[0]);
  })
);

miscRouter.delete(
  '/saved-searches/:searchId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { searchId } = z.object({ searchId: uuidLike }).parse(req.params);

    await db.query(`delete from public.saved_searches where id = $1 and organization_id = $2`, [
      searchId,
      auth.organizationId,
    ]);

    res.status(204).send();
  })
);

// ── Bulk actions (cases + clients) ──────────────────────────────────────────

miscRouter.post(
  '/bulk/cases',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = z
      .object({
        ids: z.array(uuidLike).min(1),
        action: z.object({
          type: z.enum(['delete', 'setStatus']),
          status: z.string().optional(),
        }),
      })
      .parse(req.body);

    if (body.action.type === 'delete') {
      await db.query(
        `delete from public.cases where id = any($1::uuid[]) and organization_id = $2`,
        [body.ids, auth.organizationId]
      );
    } else if (body.action.type === 'setStatus' && body.action.status) {
      await db.query(
        `update public.cases set status = $1, updated_at = now() where id = any($2::uuid[]) and organization_id = $3`,
        [body.action.status, body.ids, auth.organizationId]
      );
    }

    res.status(200).json({ success: true });
  })
);

miscRouter.post(
  '/bulk/clients',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = z
      .object({
        ids: z.array(uuidLike).min(1),
        action: z.object({
          type: z.enum(['delete', 'setStatus']),
          status: z.string().optional(),
        }),
      })
      .parse(req.body);

    if (body.action.type === 'delete') {
      await db.query(
        `delete from public.clients where id = any($1::uuid[]) and organization_id = $2`,
        [body.ids, auth.organizationId]
      );
    } else if (body.action.status) {
      await db.query(
        `update public.clients set status = $1, updated_at = now() where id = any($2::uuid[]) and organization_id = $3`,
        [body.action.status, body.ids, auth.organizationId]
      );
    }

    res.status(200).json({ success: true });
  })
);

// ── Contract templates ──────────────────────────────────────────────────────

miscRouter.get(
  '/contract-templates',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db
      .query(
        `select * from public.contract_templates where organization_id = $1 or is_public = true order by name`,
        [auth.organizationId]
      )
      .catch(() => ({ rows: [] }));

    res.status(200).json(result.rows);
  })
);

miscRouter.post(
  '/contract-templates',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = z
      .object({
        name: z.string().trim().min(1),
        description: z.string().optional(),
        template_content: z.string(),
        contract_type: z.string(),
        is_public: z.boolean().default(false),
      })
      .parse(req.body);

    const result = await db.query(
      `insert into public.contract_templates (name, description, template_content, contract_type, is_public, organization_id, created_by, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,now(),now()) returning *`,
      [
        body.name,
        body.description || null,
        body.template_content,
        body.contract_type,
        body.is_public,
        auth.organizationId,
        auth.userId,
      ]
    );

    res.status(201).json(result.rows[0]);
  })
);

// ── Onboarding status (combined login count + steps) ───────────────────────

miscRouter.get(
  '/onboarding-status',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const [loginResult, stepsResult] = await Promise.all([
      db.query(`SELECT login_count FROM public.auth_users WHERE id = $1`, [auth.userId]),
      db
        .query(
          `SELECT * FROM public.user_onboarding_steps WHERE user_id = $1 AND organization_id = $2 ORDER BY created_at ASC`,
          [auth.userId, auth.organizationId]
        )
        .catch(() => ({ rows: [] })),
    ]);

    const loginCount = (loginResult.rows[0]?.login_count as number) ?? 0;

    res.status(200).json({
      loginCount,
      steps: stepsResult.rows,
      showChecklist: loginCount <= 3,
    });
  })
);

// ── Onboarding steps ────────────────────────────────────────────────────────

miscRouter.get(
  '/onboarding-steps',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db
      .query(
        `select * from public.user_onboarding_steps where user_id = $1 and organization_id = $2 order by created_at asc`,
        [auth.userId, auth.organizationId]
      )
      .catch(() => ({ rows: [] }));

    res.status(200).json(result.rows);
  })
);

miscRouter.put(
  '/onboarding-steps/:stepName',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { stepName } = z.object({ stepName: z.string().trim().min(1) }).parse(req.params);
    const body = z
      .object({ metadata: z.record(z.string(), z.unknown()).optional() })
      .parse(req.body);

    const result = await db.query(
      `insert into public.user_onboarding_steps (user_id, organization_id, step_name, completed, completed_at, metadata)
       values ($1, $2, $3, true, now(), $4)
       on conflict (user_id, step_name) do update set completed = true, completed_at = now(), metadata = coalesce(excluded.metadata, public.user_onboarding_steps.metadata)
       returning *`,
      [
        auth.userId,
        auth.organizationId,
        stepName,
        body.metadata ? JSON.stringify(body.metadata) : null,
      ]
    );

    res.status(200).json(result.rows[0]);
  })
);

// ── Voice transcriptions ────────────────────────────────────────────────────

miscRouter.get(
  '/voice-transcriptions',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db.query(
      `select id, title, transcript, summary, case_id, duration_seconds, status, created_at, updated_at
       from public.voice_transcriptions where organization_id = $1 order by created_at desc`,
      [auth.organizationId]
    );

    res.status(200).json(result.rows);
  })
);

miscRouter.get(
  '/voice-transcriptions/:transcriptionId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { transcriptionId } = z.object({ transcriptionId: uuidLike }).parse(req.params);

    const result = await db.query(
      `select id, title, transcript, summary, case_id, duration_seconds, status, created_at, updated_at
       from public.voice_transcriptions where id = $1 and organization_id = $2 limit 1`,
      [transcriptionId, auth.organizationId]
    );

    res.status(200).json(result.rows[0] || null);
  })
);

miscRouter.post(
  '/voice-transcriptions',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = z
      .object({
        title: z.string().trim().min(1),
        transcript: z.string(),
        summary: z.string().optional(),
        case_id: uuidLike.optional(),
        duration_seconds: z.number().optional(),
        status: z.string().default('completed'),
      })
      .parse(req.body);

    const result = await db.query(
      `insert into public.voice_transcriptions (title, transcript, summary, case_id, duration_seconds, status, organization_id, created_by, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now(),now()) returning *`,
      [
        body.title,
        body.transcript,
        body.summary || null,
        body.case_id || null,
        body.duration_seconds || null,
        body.status,
        auth.organizationId,
        auth.userId,
      ]
    );

    res.status(201).json(result.rows[0]);
  })
);

miscRouter.patch(
  '/voice-transcriptions/:transcriptionId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { transcriptionId } = z.object({ transcriptionId: uuidLike }).parse(req.params);
    const body = z
      .object({
        title: z.string().optional(),
        transcript: z.string().optional(),
        summary: z.string().optional(),
        case_id: uuidLike.optional(),
        status: z.string().optional(),
      })
      .parse(req.body);

    const updates: Array<{ col: string; val: unknown }> = [];
    if (body.title !== undefined) updates.push({ col: 'title', val: body.title });
    if (body.transcript !== undefined) updates.push({ col: 'transcript', val: body.transcript });
    if (body.summary !== undefined) updates.push({ col: 'summary', val: body.summary });
    if (body.case_id !== undefined) updates.push({ col: 'case_id', val: body.case_id });
    if (body.status !== undefined) updates.push({ col: 'status', val: body.status });

    if (!updates.length) {
      throw new ApiError('No fields to update', 400, 'VALIDATION_ERROR');
    }

    const setClause = updates.map((u, i) => `${u.col} = $${i + 1}`).join(', ');
    const values = updates.map((u) => u.val);

    const result = await db.query(
      `update public.voice_transcriptions set ${setClause}, updated_at = now() where id = $${values.length + 1} and organization_id = $${values.length + 2} returning *`,
      [...values, transcriptionId, auth.organizationId]
    );

    if (!result.rows[0]) throw new ApiError('Transcription not found', 404, 'NOT_FOUND');
    res.status(200).json(result.rows[0]);
  })
);

miscRouter.delete(
  '/voice-transcriptions/:transcriptionId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { transcriptionId } = z.object({ transcriptionId: uuidLike }).parse(req.params);

    await db.query(
      `delete from public.voice_transcriptions where id = $1 and organization_id = $2`,
      [transcriptionId, auth.organizationId]
    );

    res.status(204).send();
  })
);

// ── Subscriptions ───────────────────────────────────────────────────────────

miscRouter.get(
  '/subscriptions/current',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db
      .query(
        `select * from public.subscriptions where organization_id = $1 and status = 'active' order by created_at desc limit 1`,
        [auth.organizationId]
      )
      .catch(() => ({ rows: [] }));

    res.status(200).json(result.rows[0] || null);
  })
);

miscRouter.get(
  '/subscriptions/payments',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const limit = Number(req.query.limit) || 20;

    const result = await db
      .query(
        `select id, organization_id, user_id, subscription_id, plan_id,
                provider, tx_ref, provider_tx_id, amount, currency,
                status, payment_type, billing_interval, customer_email,
                metadata, verified_at, created_at, updated_at
           from public.payment_transactions
          where organization_id = $1
          order by created_at desc
          limit $2`,
        [auth.organizationId, limit]
      )
      .catch(() => ({ rows: [] }));

    res.status(200).json(result.rows);
  })
);

// ── Subscriptions: combined billing view ───────────────────────────────────

miscRouter.get(
  '/subscriptions/billing',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const subRes = await db
      .query(
        `select s.*, p.id as plan_pk, p.name as plan_name,
                p.display_name as plan_display_name, p.plan_type, p.features
           from public.subscriptions s
           left join public.user_plans p on p.id = s.plan_id
          where s.organization_id = $1
            and s.status in ('active','trialing','past_due')
          order by s.created_at desc
          limit 1`,
        [auth.organizationId]
      )
      .catch(() => ({ rows: [] as Record<string, unknown>[] }));

    const sub = subRes.rows[0] ?? null;

    const payRes = await db
      .query(
        `select id, organization_id, user_id, subscription_id, plan_id,
                provider, tx_ref, provider_tx_id, amount, currency,
                status, payment_type, billing_interval, customer_email,
                metadata, verified_at, created_at, updated_at
           from public.payment_transactions
          where organization_id = $1
          order by created_at desc
          limit 10`,
        [auth.organizationId]
      )
      .catch(() => ({ rows: [] as Record<string, unknown>[] }));

    res.status(200).json({
      subscription: sub
        ? {
            id: sub.id,
            organization_id: sub.organization_id,
            user_id: sub.user_id,
            plan_id: sub.plan_id,
            status: sub.status,
            billing_interval: sub.billing_interval,
            current_period_start: sub.current_period_start,
            current_period_end: sub.current_period_end,
            trial_ends_at: sub.trial_ends_at,
            cancel_at_period_end: sub.cancel_at_period_end,
            cancelled_at: sub.cancelled_at,
            provider: sub.provider,
            provider_customer_email: sub.provider_customer_email,
            provider_reference: sub.provider_reference,
            created_at: sub.created_at,
            updated_at: sub.updated_at,
          }
        : null,
      plan: sub?.plan_pk
        ? {
            id: sub.plan_pk,
            name: sub.plan_name,
            display_name: sub.plan_display_name,
            plan_type: sub.plan_type,
            features: sub.features ?? [],
          }
        : null,
      recent_payments: payRes.rows,
    });
  })
);

// ── Subscriptions: initiate Paystack payment ───────────────────────────────

const initiatePaymentSchema = z.object({
  plan_id: uuidLike,
  billing_interval: z.enum(['monthly', 'yearly']),
  redirect_url: z.string().url().optional(),
});

miscRouter.post(
  '/subscriptions/initiate-payment',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = initiatePaymentSchema.parse(req.body);

    // Bound abuse: a malicious authed user can otherwise spam this and
    // both inflate payment_transactions rows and burn our Paystack
    // per-key rate budget, blocking real checkouts.
    const rate = checkRateLimit(`billing:initiate-payment:${auth.userId}`, 10, 60_000);
    res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfter));
      throw new ApiError('Too many requests. Please try again later.', 429, 'RATE_LIMIT_EXCEEDED');
    }

    if (!isPaystackConfigured()) {
      throw new ApiError(
        'Payments are not configured on this environment.',
        503,
        'PAYSTACK_NOT_CONFIGURED'
      );
    }

    const planRes = await db.query<{
      id: string;
      price_monthly: string | null;
      price_yearly: string | null;
      currency: string | null;
      plan_type: string | null;
      display_name: string | null;
    }>(
      `select id, price_monthly, price_yearly, currency, plan_type, display_name
         from public.user_plans
        where id = $1 and is_active = true
        limit 1`,
      [body.plan_id]
    );
    const plan = planRes.rows[0];
    if (!plan) throw new ApiError('Plan not found.', 404, 'PLAN_NOT_FOUND');
    if (plan.plan_type === 'free') {
      throw new ApiError('The free plan does not require payment.', 400, 'FREE_PLAN');
    }
    if (plan.plan_type === 'enterprise') {
      throw new ApiError(
        'Enterprise plans are sold via direct contract — contact sales.',
        400,
        'ENTERPRISE_PLAN'
      );
    }

    const priceRaw = body.billing_interval === 'yearly' ? plan.price_yearly : plan.price_monthly;
    const planAmount = priceRaw == null ? null : Number(priceRaw);
    if (!planAmount || planAmount <= 0 || !Number.isFinite(planAmount)) {
      throw new ApiError(
        `Plan has no ${body.billing_interval} price configured.`,
        400,
        'PLAN_PRICE_MISSING'
      );
    }
    const planCurrency = plan.currency ?? 'USD';

    // FX conversion: plans are priced in USD for display, but Paystack
    // settles in NGN. `convertForPaystack` returns both legs so we can
    // store the display USD price next to the charged NGN amount.
    const conv = await convertForPaystack(planAmount, planCurrency);
    const amount = conv.chargedAmount;
    const currency = conv.chargedCurrency;

    const profRes = await db.query<{ email: string | null }>(
      `select email from public.profiles where user_id = $1 limit 1`,
      [auth.userId]
    );
    const email = profRes.rows[0]?.email;
    if (!email) {
      throw new ApiError(
        'Your account is missing an email address. Update your profile and try again.',
        400,
        'EMAIL_REQUIRED'
      );
    }

    const txRef = generateTxRef();
    const callbackUrl =
      body.redirect_url ||
      (env.APP_URL
        ? new URL('/billing/callback', env.APP_URL).toString()
        : 'https://app.kourti.com/billing/callback');

    await db.query(
      `insert into public.payment_transactions
         (organization_id, user_id, plan_id, provider, tx_ref,
          amount, currency, status, payment_type, billing_interval,
          customer_email, metadata,
          display_amount, display_currency, fx_rate, fx_source)
       values ($1, $2, $3, 'paystack', $4,
               $5, $6, 'pending', 'subscription', $7,
               $8, $9::jsonb,
               $10, $11, $12, $13)`,
      [
        auth.organizationId,
        auth.userId,
        plan.id,
        txRef,
        amount,
        currency,
        body.billing_interval,
        email,
        JSON.stringify({
          plan_display_name: plan.display_name,
          billing_interval: body.billing_interval,
          initiated_via: 'pricing_page',
        }),
        conv.displayAmount,
        conv.displayCurrency,
        conv.fxRate,
        conv.fxSource,
      ]
    );

    let initRes;
    try {
      initRes = await initializeTransaction({
        email,
        amount,
        currency,
        reference: txRef,
        callbackUrl,
        metadata: {
          organization_id: auth.organizationId,
          user_id: auth.userId,
          plan_id: plan.id,
          billing_interval: body.billing_interval,
        },
      });
    } catch (err) {
      await db
        .query(
          `update public.payment_transactions
              set status = 'failed', updated_at = now()
            where tx_ref = $1`,
          [txRef]
        )
        .catch(() => undefined);
      throw err;
    }

    res.status(200).json({
      payment_link: initRes.authorization_url,
      tx_ref: txRef,
      reference: initRes.reference,
    });
  })
);

// ── Subscriptions: verify a transaction (user-driven path) ─────────────────

const verifyPaymentSchema = z.object({
  tx_ref: z.string().min(1).max(120),
});

miscRouter.post(
  '/subscriptions/verify-payment',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = verifyPaymentSchema.parse(req.body);

    // Rate-limit the verify path too — it hits Paystack's API per call.
    const rate = checkRateLimit(`billing:verify-payment:${auth.userId}`, 20, 60_000);
    res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfter));
      throw new ApiError('Too many requests. Please try again later.', 429, 'RATE_LIMIT_EXCEEDED');
    }

    // Only members of the org that started the tx may verify it.
    // Important: do NOT distinguish "not found" from "belongs to another
    // org" in the response — that distinction is a cross-tenant existence
    // oracle that lets authed users enumerate other orgs' tx_refs.
    const ownRes = await db.query<{ organization_id: string; status: string }>(
      `select organization_id, status from public.payment_transactions where tx_ref = $1 limit 1`,
      [body.tx_ref]
    );
    const own = ownRes.rows[0];
    if (!own || own.organization_id !== auth.organizationId) {
      res.status(200).json({
        success: false,
        payment_status: 'unknown',
        subscription_status: null,
        message: 'Transaction not found',
      });
      return;
    }

    if (!isPaystackConfigured()) {
      throw new ApiError(
        'Payments are not configured on this environment.',
        503,
        'PAYSTACK_NOT_CONFIGURED'
      );
    }

    const paystack = await verifyTransaction(body.tx_ref);
    const activation = await activateSubscriptionFromTx(body.tx_ref, paystack, 'verify');

    const paymentStatusMap: Record<string, 'pending' | 'successful' | 'failed' | 'unknown'> = {
      activated: 'successful',
      already_processed: 'successful',
      pending: 'pending',
      failed: 'failed',
      not_found: 'unknown',
    };

    res.status(200).json({
      success: activation.status === 'activated' || activation.status === 'already_processed',
      payment_status: paymentStatusMap[activation.status] ?? 'unknown',
      subscription_status: activation.subscription_status,
      subscription_id: activation.subscription_id ?? undefined,
      already_processed: activation.status === 'already_processed',
      message: activation.message,
    });
  })
);

// ── Subscriptions: manage (cancel / activate / deactivate) ─────────────────

const manageSchema = z.object({
  action: z.enum(['activate', 'deactivate', 'cancel']),
  subscription_id: uuidLike,
});

miscRouter.post(
  '/subscriptions/manage',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = manageSchema.parse(req.body);

    const allowed = await isOrgAdminOrSoleMember(auth.userId, auth.organizationId);
    if (!allowed) {
      throw new ApiError(
        'Only an organization admin can manage the subscription.',
        403,
        'FORBIDDEN'
      );
    }

    const subRes = await db.query<{ id: string; status: string }>(
      `select id, status from public.subscriptions
        where id = $1 and organization_id = $2
        limit 1`,
      [body.subscription_id, auth.organizationId]
    );
    const sub = subRes.rows[0];
    if (!sub) throw new ApiError('Subscription not found.', 404, 'NOT_FOUND');

    if (body.action === 'cancel') {
      await db.query(
        `update public.subscriptions
            set cancel_at_period_end = true,
                cancelled_at = now(),
                updated_at = now()
          where id = $1`,
        [sub.id]
      );
    } else if (body.action === 'deactivate') {
      await db.query(
        `update public.subscriptions
            set status = 'paused', updated_at = now()
          where id = $1`,
        [sub.id]
      );
    } else if (body.action === 'activate') {
      await db.query(
        `update public.subscriptions
            set status = 'active',
                cancel_at_period_end = false,
                cancelled_at = null,
                updated_at = now()
          where id = $1`,
        [sub.id]
      );
    }

    res.status(200).json({ ok: true, action: body.action });
  })
);

// ── User plans ──────────────────────────────────────────────────────────────

miscRouter.get(
  '/user-plans',
  asyncHandler(async (_req, res) => {
    const result = await db
      .query(`select * from public.user_plans where is_active = true order by plan_type asc`)
      .catch(() => ({ rows: [] }));

    res.status(200).json(
      result.rows.map((p: Record<string, unknown>) => ({
        ...p,
        features: p.features || [],
      }))
    );
  })
);

miscRouter.get(
  '/user-plans/current',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db
      .query(
        `select upa.id as assignment_id, upa.user_id, up.id as plan_id, up.name as plan_name,
              up.display_name as plan_display_name, up.plan_type, up.features,
              upa.starts_at, upa.expires_at, upa.status
       from public.user_plan_assignments upa
       join public.user_plans up on up.id = upa.plan_id
       where upa.user_id = $1 and upa.status = 'active'
       order by upa.created_at desc limit 1`,
        [auth.userId]
      )
      .catch(() => ({ rows: [] }));

    res.status(200).json(result.rows[0] || null);
  })
);

// ── Case types ──────────────────────────────────────────────────────────────

miscRouter.get(
  '/case-types',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const result = await db
      .query(`SELECT * FROM public.case_types WHERE organization_id = $1 ORDER BY name`, [
        auth.organizationId,
      ])
      .catch(() => ({ rows: [] }));
    res.status(200).json(result.rows);
  })
);

miscRouter.post(
  '/case-types',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = z
      .object({ name: z.string().trim().min(1), description: z.string().optional() })
      .parse(req.body);
    const result = await db.query(
      `INSERT INTO public.case_types (name, description, organization_id, created_by, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now()) RETURNING *`,
      [body.name, body.description || null, auth.organizationId, auth.userId]
    );
    res.status(201).json(result.rows[0]);
  })
);

// ── Case fields ─────────────────────────────────────────────────────────────

miscRouter.get(
  '/case-fields',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const caseTypeId = typeof req.query.caseTypeId === 'string' ? req.query.caseTypeId : undefined;
    const clauses = ['organization_id = $1'];
    const values: unknown[] = [auth.organizationId];
    if (caseTypeId) {
      values.push(caseTypeId);
      clauses.push(`case_type_id = $${values.length}`);
    }
    const result = await db
      .query(
        `SELECT * FROM public.case_fields WHERE ${clauses.join(' AND ')} ORDER BY sort_order, created_at`,
        values
      )
      .catch(() => ({ rows: [] }));
    res.status(200).json(result.rows);
  })
);

miscRouter.post(
  '/case-fields',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = z
      .object({
        case_type_id: uuidLike,
        name: z.string().trim().min(1),
        field_type: z.string().default('text'),
        required: z.boolean().default(false),
        options: z.array(z.string()).optional(),
        sort_order: z.number().int().optional(),
      })
      .parse(req.body);
    const result = await db.query(
      `INSERT INTO public.case_fields (case_type_id, organization_id, name, field_type, required, options, sort_order, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now(),now()) RETURNING *`,
      [
        body.case_type_id,
        auth.organizationId,
        body.name,
        body.field_type,
        body.required,
        body.options ? JSON.stringify(body.options) : null,
        body.sort_order || 0,
      ]
    );
    res.status(201).json(result.rows[0]);
  })
);

miscRouter.patch(
  '/case-fields/:fieldId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { fieldId } = z.object({ fieldId: uuidLike }).parse(req.params);
    const body = req.body as Record<string, unknown>;
    const allowed = ['name', 'field_type', 'required', 'options', 'sort_order'];
    const updates: Array<{ col: string; val: unknown }> = [];
    for (const f of allowed) {
      if (body[f] !== undefined)
        updates.push({ col: f, val: f === 'options' ? JSON.stringify(body[f]) : body[f] });
    }
    if (!updates.length) {
      res.status(200).json({});
      return;
    }
    const setClause = updates.map((u, i) => `${u.col} = $${i + 1}`).join(', ');
    const values = updates.map((u) => u.val);
    const result = await db.query(
      `UPDATE public.case_fields SET ${setClause}, updated_at = now() WHERE id = $${values.length + 1} AND organization_id = $${values.length + 2} RETURNING *`,
      [...values, fieldId, auth.organizationId]
    );
    res.status(200).json(result.rows[0] || null);
  })
);

miscRouter.delete(
  '/case-fields/:fieldId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { fieldId } = z.object({ fieldId: uuidLike }).parse(req.params);
    await db.query('DELETE FROM public.case_fields WHERE id = $1 AND organization_id = $2', [
      fieldId,
      auth.organizationId,
    ]);
    res.status(204).send();
  })
);

// ── Case issues ─────────────────────────────────────────────────────────────

miscRouter.get(
  '/case-issues',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const caseId = typeof req.query.caseId === 'string' ? req.query.caseId : undefined;
    const caseTypeId = typeof req.query.caseTypeId === 'string' ? req.query.caseTypeId : undefined;
    const clauses = ['organization_id = $1'];
    const values: unknown[] = [auth.organizationId];
    if (caseId) {
      values.push(caseId);
      clauses.push(`case_id = $${values.length}`);
    }
    if (caseTypeId) {
      values.push(caseTypeId);
      clauses.push(`case_type_id = $${values.length}`);
    }
    const result = await db
      .query(
        `SELECT * FROM public.case_issues WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`,
        values
      )
      .catch(() => ({ rows: [] }));
    res.status(200).json(result.rows);
  })
);

// ── Case activities ─────────────────────────────────────────────────────────

miscRouter.get(
  '/case-activities',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const caseId = typeof req.query.caseId === 'string' ? req.query.caseId : undefined;
    const clauses = ['ca.organization_id = $1'];
    const values: unknown[] = [auth.organizationId];
    if (caseId) {
      values.push(caseId);
      clauses.push(`ca.case_id = $${values.length}`);
    }
    const result = await db
      .query(
        `SELECT ca.*, p.first_name, p.last_name, p.email as user_email FROM public.case_activities ca LEFT JOIN public.profiles p ON p.user_id = ca.user_id WHERE ${clauses.join(' AND ')} ORDER BY ca.created_at DESC`,
        values
      )
      .catch(() => ({ rows: [] }));
    res.status(200).json(result.rows);
  })
);

miscRouter.post(
  '/case-activities',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = z
      .object({
        case_id: uuidLike,
        activity_type: z.string().trim().min(1),
        title: z.string().trim().min(1),
        description: z.string().optional(),
        date: z.string().optional(),
        duration_minutes: z.number().int().optional(),
        billable: z.boolean().optional(),
      })
      .parse(req.body);
    const result = await db.query(
      `INSERT INTO public.case_activities (case_id, organization_id, user_id, activity_type, title, description, date, duration_minutes, billable, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now()) RETURNING *`,
      [
        body.case_id,
        auth.organizationId,
        auth.userId,
        body.activity_type,
        body.title,
        body.description || null,
        body.date || new Date().toISOString(),
        body.duration_minutes || null,
        body.billable || false,
      ]
    );
    res.status(201).json(result.rows[0]);
  })
);

miscRouter.patch(
  '/case-activities/:activityId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { activityId } = z.object({ activityId: uuidLike }).parse(req.params);
    const body = req.body as Record<string, unknown>;
    const allowed = [
      'activity_type',
      'title',
      'description',
      'date',
      'duration_minutes',
      'billable',
    ];
    const updates: Array<{ col: string; val: unknown }> = [];
    for (const f of allowed) {
      if (body[f] !== undefined) updates.push({ col: f, val: body[f] });
    }
    if (!updates.length) {
      res.status(200).json({});
      return;
    }
    const setClause = updates.map((u, i) => `${u.col} = $${i + 1}`).join(', ');
    const values = updates.map((u) => u.val);
    const result = await db.query(
      `UPDATE public.case_activities SET ${setClause}, updated_at = now() WHERE id = $${values.length + 1} AND organization_id = $${values.length + 2} RETURNING *`,
      [...values, activityId, auth.organizationId]
    );
    res.status(200).json(result.rows[0] || null);
  })
);

miscRouter.delete(
  '/case-activities/:activityId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { activityId } = z.object({ activityId: uuidLike }).parse(req.params);
    await db.query('DELETE FROM public.case_activities WHERE id = $1 AND organization_id = $2', [
      activityId,
      auth.organizationId,
    ]);
    res.status(204).send();
  })
);

// ── SSO config ──────────────────────────────────────────────────────────────

miscRouter.get(
  '/sso-config',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const result = await db
      .query(`SELECT * FROM public.organization_sso_configs WHERE organization_id = $1`, [
        auth.organizationId,
      ])
      .catch(() => ({ rows: [] }));
    res.status(200).json(result.rows);
  })
);

miscRouter.post(
  '/sso-config/manage',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    // Require admin/superadmin role or platform admin
    const isPlatAdmin = await isPlatformAdminUser(auth.userId);
    if (!isPlatAdmin) {
      const roleResult = await db.query(
        `SELECT role_name FROM public.user_role_assignments WHERE user_id = $1 AND organization_id = $2`,
        [auth.userId, auth.organizationId]
      );
      const roles = roleResult.rows.map((r: Record<string, unknown>) => r.role_name as string);
      if (!roles.includes('admin') && !roles.includes('superadmin')) {
        throw new ApiError('Forbidden', 403, 'FORBIDDEN');
      }
    }

    const { action, payload } = req.body;

    if (!action || !payload) {
      return res.status(400).json({ error: 'Missing action or payload' });
    }

    const ssoKey = (await import('../../config/env.js')).env.SSO_SECRET_KEY;

    switch (action) {
      case 'create': {
        const { provider, clientId, clientSecret, tenantId, domainHint, redirectUri, isEnabled } =
          payload;
        const result = await db.query(
          `INSERT INTO public.organization_sso_configs
            (organization_id, provider, client_id, client_secret, tenant_id, domain_hint, redirect_uri, is_enabled, created_by, updated_by)
           VALUES ($1, $2, $3,
             CASE WHEN $4::text IS NOT NULL THEN pgp_sym_encrypt($4::text, $8::text) ELSE NULL END,
             $5, $6, $7, $9, $10, $10)
           RETURNING id, organization_id, provider, client_id, tenant_id, domain_hint, redirect_uri, is_enabled,
             client_secret IS NOT NULL AS has_client_secret,
             CASE WHEN client_secret IS NOT NULL THEN '••••••••' ELSE NULL END AS client_secret_masked,
             created_by, updated_by, created_at, updated_at`,
          [
            auth.organizationId,
            provider,
            clientId,
            clientSecret || null,
            tenantId || null,
            domainHint || null,
            redirectUri || null,
            ssoKey,
            isEnabled ?? false,
            auth.userId,
          ]
        );
        return res.status(200).json({ data: result.rows[0] });
      }

      case 'update': {
        const { id, clientId, clientSecret, tenantId, domainHint, redirectUri, isEnabled } =
          payload;
        const result = await db.query(
          `UPDATE public.organization_sso_configs
           SET
             client_id = COALESCE($2, client_id),
             client_secret = CASE WHEN $3::text IS NOT NULL AND $3::text != '' THEN pgp_sym_encrypt($3::text, $8::text) ELSE client_secret END,
             tenant_id = $4,
             domain_hint = $5,
             redirect_uri = $6,
             is_enabled = COALESCE($7, is_enabled),
             updated_by = $9,
             updated_at = timezone('utc', now())
           WHERE id = $1 AND organization_id = $10
           RETURNING id, organization_id, provider, client_id, tenant_id, domain_hint, redirect_uri, is_enabled,
             client_secret IS NOT NULL AS has_client_secret,
             CASE WHEN client_secret IS NOT NULL THEN '••••••••' ELSE NULL END AS client_secret_masked,
             created_by, updated_by, created_at, updated_at`,
          [
            id,
            clientId,
            clientSecret || null,
            tenantId ?? null,
            domainHint ?? null,
            redirectUri ?? null,
            isEnabled,
            ssoKey,
            auth.userId,
            auth.organizationId,
          ]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'SSO config not found' });
        }
        return res.status(200).json({ data: result.rows[0] });
      }

      case 'delete': {
        const { id } = payload;
        await db.query(
          `DELETE FROM public.organization_sso_configs WHERE id = $1 AND organization_id = $2`,
          [id, auth.organizationId]
        );
        return res.status(200).json({ data: true });
      }

      case 'rotate': {
        const { id, clientSecret } = payload;
        if (!clientSecret) {
          return res.status(400).json({ error: 'clientSecret is required for rotation' });
        }
        const result = await db.query(
          `UPDATE public.organization_sso_configs
           SET client_secret = pgp_sym_encrypt($2::text, $3::text),
               updated_by = $4, updated_at = timezone('utc', now())
           WHERE id = $1 AND organization_id = $5
           RETURNING id, organization_id, provider, client_id, tenant_id, domain_hint, redirect_uri, is_enabled,
             client_secret IS NOT NULL AS has_client_secret,
             CASE WHEN client_secret IS NOT NULL THEN '••••••••' ELSE NULL END AS client_secret_masked,
             created_by, updated_by, created_at, updated_at`,
          [id, clientSecret, ssoKey, auth.userId, auth.organizationId]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'SSO config not found' });
        }
        return res.status(200).json({ data: result.rows[0] });
      }

      case 'test': {
        const { id } = payload;
        const configResult = await db.query(
          `SELECT id, provider, client_id, tenant_id, domain_hint, redirect_uri, is_enabled,
                  client_secret IS NOT NULL AS has_client_secret
           FROM public.organization_sso_configs
           WHERE id = $1 AND organization_id = $2`,
          [id, auth.organizationId]
        );
        if (configResult.rows.length === 0) {
          return res.status(200).json({
            data: { success: false, message: 'SSO configuration not found.' },
          });
        }
        const config = configResult.rows[0];
        const errors: string[] = [];

        if (!config.client_id) errors.push('Client ID is missing');
        if (!config.has_client_secret) errors.push('Client secret is not set');
        if (!config.redirect_uri) errors.push('Redirect URI is missing');
        if (config.provider === 'microsoft' && !config.tenant_id)
          errors.push('Tenant ID is required for Microsoft Entra ID');

        if (errors.length > 0) {
          return res.status(200).json({
            data: {
              success: false,
              message: 'Configuration has issues that need to be resolved.',
              errors,
              config: {
                provider: config.provider,
                client_id: config.client_id,
                redirect_uri: config.redirect_uri,
                tenant_id: config.tenant_id,
                domain_hint: config.domain_hint,
                is_enabled: config.is_enabled,
              },
            },
          });
        }

        return res.status(200).json({
          data: {
            success: true,
            message: `${config.provider === 'google' ? 'Google Workspace' : 'Microsoft Entra ID'} configuration looks valid. All required fields are present.`,
            config: {
              provider: config.provider,
              client_id: config.client_id,
              redirect_uri: config.redirect_uri,
              tenant_id: config.tenant_id,
              domain_hint: config.domain_hint,
              is_enabled: config.is_enabled,
            },
          },
        });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  })
);
