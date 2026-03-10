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
import {
  activateSubscription,
  deactivateSubscription,
  cancelSubscription,
} from '../_shared/flutterwaveClient.ts';

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
        'http://localhost:8081',
        'http://localhost:8082',
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

type SubscriptionAction = 'activate' | 'deactivate' | 'cancel';

interface ManageSubscriptionRequest {
  action: SubscriptionAction;
  subscription_id: string;
  reason?: string;
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
    // 2. Parse & validate request body
    // -----------------------------------------------------------------------

    const body = (await req.json()) as ManageSubscriptionRequest;

    if (!body.action || !['activate', 'deactivate', 'cancel'].includes(body.action)) {
      throw new HttpError(
        'Invalid action. Must be one of: activate, deactivate, cancel',
        400,
        'INVALID_INPUT'
      );
    }

    if (!body.subscription_id) {
      throw new HttpError('subscription_id is required', 400, 'INVALID_INPUT');
    }

    console.log(
      `Processing subscription ${body.action} for user ${user.id}, subscription ${body.subscription_id}`
    );

    // -----------------------------------------------------------------------
    // 3. Authorization check – verify user belongs to the same org
    // -----------------------------------------------------------------------

    const { data: subscription, error: subError } = (await supabase
      .from('subscriptions' as never)
      .select('*, organization_id, flutterwave_subscription_id, status')
      .eq('id', body.subscription_id)
      .single()) as { data: Record<string, unknown> | null; error: { message?: string } | null };

    if (subError || !subscription) {
      throw new HttpError('Subscription not found', 404, 'NOT_FOUND');
    }

    // Get user's profile to find their organization
    const { data: profile, error: profileError } = (await supabase
      .from('profiles' as never)
      .select('organization_id')
      .eq('user_id', user.id)
      .single()) as {
      data: { organization_id: string } | null;
      error: { message?: string } | null;
    };

    if (profileError || !profile) {
      throw new HttpError('User profile not found', 404, 'PROFILE_NOT_FOUND');
    }

    if (subscription.organization_id !== profile.organization_id) {
      throw new HttpError(
        'You do not have permission to manage this subscription',
        403,
        'FORBIDDEN'
      );
    }

    // -----------------------------------------------------------------------
    // 4. Get Flutterwave subscription ID
    // -----------------------------------------------------------------------

    const flwSubId = subscription.flutterwave_subscription_id as string | undefined;
    if (!flwSubId) {
      throw new HttpError(
        'No Flutterwave subscription ID associated with this subscription',
        400,
        'MISSING_FLW_SUBSCRIPTION'
      );
    }

    // -----------------------------------------------------------------------
    // 5. Call Flutterwave API based on action
    // -----------------------------------------------------------------------

    let flwResult;

    switch (body.action) {
      case 'activate':
        flwResult = await activateSubscription(flwSubId);
        break;
      case 'deactivate':
        flwResult = await deactivateSubscription(flwSubId);
        break;
      case 'cancel':
        flwResult = await cancelSubscription(flwSubId);
        break;
    }

    console.log(`Flutterwave ${body.action} response:`, flwResult.status, flwResult.message);

    // -----------------------------------------------------------------------
    // 6. Update local DB
    // -----------------------------------------------------------------------

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    switch (body.action) {
      case 'activate':
        updateData.status = 'active';
        break;
      case 'deactivate':
        updateData.status = 'paused';
        break;
      case 'cancel':
        // Honor the remaining period – don't immediately revoke access
        updateData.cancel_at_period_end = true;
        break;
    }

    const { data: updatedSubscription, error: updateError } = (await supabase
      .from('subscriptions' as never)
      .update(updateData as never)
      .eq('id', body.subscription_id)
      .select()
      .single()) as { data: Record<string, unknown> | null; error: { message?: string } | null };

    if (updateError) {
      console.error('Failed to update subscription in database:', updateError);
      throw new HttpError('Failed to update subscription status', 500, 'DB_UPDATE_FAILED');
    }

    // -----------------------------------------------------------------------
    // 7. Log to audit_logs
    // -----------------------------------------------------------------------

    const auditEntry = {
      user_id: user.id,
      organization_id: profile.organization_id,
      action: `subscription.${body.action}`,
      resource_type: 'subscription',
      resource_id: body.subscription_id,
      details: {
        flutterwave_subscription_id: flwSubId,
        previous_status: subscription.status,
        new_status: updateData.status ?? subscription.status,
        cancel_at_period_end: updateData.cancel_at_period_end ?? false,
        reason: body.reason ?? null,
      },
      created_at: new Date().toISOString(),
    };

    const { error: auditError } = await supabase
      .from('audit_logs' as never)
      .insert(auditEntry as never);

    if (auditError) {
      // Non-critical – log but don't fail the request
      console.error('Failed to write audit log:', auditError);
    }

    // -----------------------------------------------------------------------
    // 8. Return updated subscription status
    // -----------------------------------------------------------------------

    return createJsonResponse(
      {
        success: true,
        data: {
          id: updatedSubscription.id,
          status: updatedSubscription.status,
          cancel_at_period_end: updatedSubscription.cancel_at_period_end,
          action_performed: body.action,
          flutterwave_status: flwResult.status,
        },
      },
      { cors: corsOptions }
    );
  } catch (error: unknown) {
    if (error instanceof HttpError) {
      return createErrorResponse(error, corsOptions);
    }
    return createSanitizedErrorResponse(error, corsOptions, {
      function: 'flutterwave-subscription-manage',
    });
  }
});
