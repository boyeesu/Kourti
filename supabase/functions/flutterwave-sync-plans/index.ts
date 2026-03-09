declare const Deno: {
  env: { get(key: string): string | undefined };
};

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
  createEmptyResponse,
  createJsonResponse,
  CorsSecurityHeadersOptions,
} from '../_shared/responseHeaders.ts';
import { createErrorResponse as createSanitizedErrorResponse } from '../_shared/errorHandling.ts';
import { HttpError, createErrorResponse } from '../_shared/httpError.ts';
import { createPaymentPlan, updatePaymentPlan } from '../_shared/flutterwaveClient.ts';

// ---------------------------------------------------------------------------
// CORS Configuration
// ---------------------------------------------------------------------------

const ALLOWED_ORIGINS = [
  Deno.env.get('APP_URL'),
  ...(Deno.env.get('ENVIRONMENT') !== 'production'
    ? [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:8080',
        'http://localhost:8083',
      ]
    : []),
  'https://app.kourti.com',
]
  .flatMap((value: string | undefined) => (value ? value.split(',') : []))
  .filter(Boolean)
  .map((origin: string) => {
    if (origin && !origin.startsWith('http://') && !origin.startsWith('https://')) {
      return `https://${origin}`;
    }
    return origin;
  })
  .filter(
    (origin: string) => origin && (origin.startsWith('http://') || origin.startsWith('https://'))
  );

function getCorsOptions(requestOrigin: string | null): CorsSecurityHeadersOptions {
  const origin =
    requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
      ? requestOrigin
      : ALLOWED_ORIGINS[0] || 'https://app.kourti.com';

  return {
    origin,
    requestOrigin,
    allowedOrigins: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : undefined,
    allowCredentials: true,
    allowMethods: ['POST', 'OPTIONS'],
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SyncPlansRequest {
  plan_id?: string;
}

interface SyncedPlanResult {
  plan_id: string;
  display_name: string;
  flutterwave_plan_id_monthly: string | null;
  flutterwave_plan_id_yearly: string | null;
  monthly_synced: boolean;
  yearly_synced: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function ensureConfigured() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new HttpError('Supabase credentials are not configured', 503, 'CONFIG_ERROR');
  }
}

function normalizeToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  return token || null;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  const requestOrigin = req.headers.get('Origin');
  const corsOptions = getCorsOptions(requestOrigin);

  if (req.method === 'OPTIONS') {
    return createEmptyResponse({ status: 200, cors: corsOptions });
  }

  try {
    ensureConfigured();

    if (req.method !== 'POST') {
      throw new HttpError('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
    }

    // -----------------------------------------------------------------------
    // 1. Authenticate user
    // -----------------------------------------------------------------------

    const token = normalizeToken(req.headers.get('Authorization'));
    if (!token) {
      throw new HttpError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('Authentication failed:', userError?.message);
      throw new HttpError('Invalid or expired authentication token', 401, 'UNAUTHORIZED');
    }

    // -----------------------------------------------------------------------
    // 2. Verify platform_admin role
    // -----------------------------------------------------------------------

    const { data: profile, error: profileError } = (await supabase
      .from('profiles' as never)
      .select('user_type')
      .eq('user_id', user.id)
      .single()) as { data: { user_type: string } | null; error: { message?: string } | null };

    if (profileError || !profile) {
      throw new HttpError('User profile not found', 404, 'PROFILE_NOT_FOUND');
    }

    if (profile.user_type !== 'platform_admin') {
      throw new HttpError('Only platform administrators can sync plans', 403, 'FORBIDDEN');
    }

    console.log(`Platform admin ${user.id} initiated plan sync`);

    // -----------------------------------------------------------------------
    // 3. Parse request body
    // -----------------------------------------------------------------------

    let body: SyncPlansRequest = {};
    try {
      body = (await req.json()) as SyncPlansRequest;
    } catch {
      // Empty body is valid – sync all plans
    }

    // -----------------------------------------------------------------------
    // 4. Fetch plans to sync
    // -----------------------------------------------------------------------

    let plansQuery = supabase.from('user_plans' as never).select('*');

    if (body.plan_id) {
      plansQuery = plansQuery.eq('id', body.plan_id);
    }

    const { data: plans, error: plansError } = (await plansQuery) as {
      data: Record<string, unknown>[] | null;
      error: { message?: string } | null;
    };

    if (plansError) {
      console.error('Failed to fetch plans:', plansError);
      throw new HttpError('Failed to fetch plans from database', 500, 'DB_QUERY_FAILED');
    }

    if (!plans || plans.length === 0) {
      return createJsonResponse(
        {
          success: true,
          data: {
            synced_plans: [],
            message: body.plan_id ? 'Plan not found' : 'No plans to sync',
          },
        },
        { cors: corsOptions }
      );
    }

    // -----------------------------------------------------------------------
    // 5. Sync each plan to Flutterwave
    // -----------------------------------------------------------------------

    const results: SyncedPlanResult[] = [];

    for (const plan of plans) {
      const result: SyncedPlanResult = {
        plan_id: plan.id as string,
        display_name: (plan.display_name ?? plan.name ?? plan.id) as string,
        flutterwave_plan_id_monthly: (plan.flutterwave_plan_id_monthly as string | null) ?? null,
        flutterwave_plan_id_yearly: (plan.flutterwave_plan_id_yearly as string | null) ?? null,
        monthly_synced: false,
        yearly_synced: false,
        errors: [],
      };

      const currency = (plan.currency as string) ?? 'USD';

      // --- Monthly plan ---
      if ((plan.price_monthly as number) > 0) {
        try {
          if (!plan.flutterwave_plan_id_monthly) {
            // Create new monthly plan on Flutterwave
            const flwResponse = await createPaymentPlan({
              amount: plan.price_monthly as number,
              name: `${result.display_name} Monthly`,
              interval: 'monthly',
              currency,
            });

            const flwPlanId = String(flwResponse.data.id);

            const { error: updateErr } = await supabase
              .from('user_plans' as never)
              .update({ flutterwave_plan_id_monthly: flwPlanId } as never)
              .eq('id', plan.id);

            if (updateErr) {
              result.errors.push(`Failed to save monthly plan ID to DB: ${updateErr.message}`);
            } else {
              result.flutterwave_plan_id_monthly = flwPlanId;
              result.monthly_synced = true;
            }

            console.log(`Created monthly Flutterwave plan ${flwPlanId} for ${result.display_name}`);
          } else {
            // Update existing monthly plan on Flutterwave
            await updatePaymentPlan(plan.flutterwave_plan_id_monthly as string, {
              name: `${result.display_name} Monthly`,
            });

            result.monthly_synced = true;
            console.log(
              `Updated monthly Flutterwave plan ${plan.flutterwave_plan_id_monthly} for ${result.display_name}`
            );
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          result.errors.push(`Monthly sync failed: ${errMsg}`);
          console.error(`Monthly sync failed for plan ${plan.id}:`, errMsg);
        }
      }

      // --- Yearly plan ---
      if ((plan.price_yearly as number) > 0) {
        try {
          if (!plan.flutterwave_plan_id_yearly) {
            // Create new yearly plan on Flutterwave
            const flwResponse = await createPaymentPlan({
              amount: plan.price_yearly as number,
              name: `${result.display_name} Yearly`,
              interval: 'yearly',
              currency,
            });

            const flwPlanId = String(flwResponse.data.id);

            const { error: updateErr } = await supabase
              .from('user_plans' as never)
              .update({ flutterwave_plan_id_yearly: flwPlanId } as never)
              .eq('id', plan.id);

            if (updateErr) {
              result.errors.push(`Failed to save yearly plan ID to DB: ${updateErr.message}`);
            } else {
              result.flutterwave_plan_id_yearly = flwPlanId;
              result.yearly_synced = true;
            }

            console.log(`Created yearly Flutterwave plan ${flwPlanId} for ${result.display_name}`);
          } else {
            // Update existing yearly plan on Flutterwave
            await updatePaymentPlan(plan.flutterwave_plan_id_yearly as string, {
              name: `${result.display_name} Yearly`,
            });

            result.yearly_synced = true;
            console.log(
              `Updated yearly Flutterwave plan ${plan.flutterwave_plan_id_yearly} for ${result.display_name}`
            );
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          result.errors.push(`Yearly sync failed: ${errMsg}`);
          console.error(`Yearly sync failed for plan ${plan.id}:`, errMsg);
        }
      }

      results.push(result);
    }

    // -----------------------------------------------------------------------
    // 6. Return results
    // -----------------------------------------------------------------------

    const totalSynced = results.filter((r) => r.monthly_synced || r.yearly_synced).length;
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

    return createJsonResponse(
      {
        success: true,
        data: {
          synced_plans: results,
          summary: {
            total_plans: results.length,
            plans_synced: totalSynced,
            total_errors: totalErrors,
          },
        },
      },
      { cors: corsOptions }
    );
  } catch (error: unknown) {
    if (error instanceof HttpError) {
      return createErrorResponse(error, corsOptions);
    }
    return createSanitizedErrorResponse(error, corsOptions, {
      function: 'flutterwave-sync-plans',
    });
  }
});
