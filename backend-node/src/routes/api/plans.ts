/**
 * Public plan listing for the /pricing page.
 *
 * Auth-gated (any signed-in user can read) but NOT subscription-gated —
 * the page exists specifically for users who don't yet have an active sub.
 * Admin-only mutations stay under /api/v1/admin/plans.
 */
import { Router } from 'express';

import { db } from '../../db/pool.js';
import { asyncHandler } from '../../lib/http.js';

export const plansRouter = Router();

interface PlanRow {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  plan_type: string;
  features: string[] | null;
  price_monthly: number | null;
  price_yearly: number | null;
  currency: string | null;
}

plansRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const result = await db
      .query<PlanRow>(
        `select id, name, display_name, description, plan_type, features,
                price_monthly, price_yearly, currency
           from public.user_plans
          where is_active = true
          order by case plan_type
                     when 'free' then 0
                     when 'starter' then 1
                     when 'professional' then 2
                     when 'enterprise' then 3
                     else 99
                   end asc`
      )
      .catch(() => ({ rows: [] as PlanRow[] }));

    res.status(200).json(result.rows);
  })
);
