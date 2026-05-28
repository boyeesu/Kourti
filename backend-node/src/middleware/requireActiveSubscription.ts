import type { NextFunction, Request, Response } from 'express';

import { env } from '../config/env.js';
import { db } from '../db/pool.js';
import { ApiError } from '../lib/http.js';
import { isPlatformAdminUser } from '../services/authorization.js';

/**
 * Gate for premium routes. Allows the request when the requesting user's
 * organization has a sub that is either `active`, or `trialing` whose
 * trial window has not yet expired.
 *
 * Platform admins are always allowed (so support can poke at customer orgs
 * even when expired). Auth-less requests fall through to 401 via the upstream
 * requireAuth middleware — this middleware always runs after it.
 */
export async function requireActiveSubscription(req: Request, _res: Response, next: NextFunction) {
  try {
    const auth = req.auth;
    if (!auth) {
      // Should never happen — requireAuth runs first — but fail closed.
      throw new ApiError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    if (env.AUTH_MODE === 'development') return next();

    if (await isPlatformAdminUser(auth.userId)) return next();

    const result = await db.query<{
      status: string;
      trial_ends_at: string | null;
      current_period_end: string | null;
    }>(
      `select status, trial_ends_at, current_period_end
         from public.subscriptions
        where organization_id = $1
          and status in ('active','trialing','past_due')
        order by created_at desc
        limit 1`,
      [auth.organizationId]
    );

    const sub = result.rows[0];
    if (!sub) {
      throw new ApiError(
        'No active subscription. Start your free trial or choose a plan.',
        402,
        'SUBSCRIPTION_REQUIRED'
      );
    }

    const now = Date.now();
    if (sub.status === 'active') return next();
    if (sub.status === 'trialing') {
      const endMs = sub.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : 0;
      if (endMs > now) return next();
      throw new ApiError(
        'Your free trial has ended. Please subscribe to continue.',
        402,
        'TRIAL_EXPIRED'
      );
    }
    // past_due — block (Stripe-style grace would belong here)
    throw new ApiError(
      'Your subscription is past due. Please update your payment method.',
      402,
      'SUBSCRIPTION_PAST_DUE'
    );
  } catch (err) {
    next(err);
  }
}
