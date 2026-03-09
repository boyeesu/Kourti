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
import { createErrorResponse } from '../_shared/errorHandling.ts';
import { HttpError, createErrorResponse as createHttpErrorResponse } from '../_shared/httpError.ts';
import { initializePayment, type InitializePaymentParams } from '../_shared/flutterwaveClient.ts';

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
  'https://kouti-legal-hub-41.lovable.app',
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

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface InitPaymentRequest {
  plan_id: string;
  billing_interval: 'monthly' | 'yearly';
  redirect_url?: string;
}

serve(async (req: Request) => {
  const requestOrigin = req.headers.get('Origin');
  const corsOptions = getCorsOptions(requestOrigin);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return createEmptyResponse({ status: 204, cors: corsOptions });
  }

  try {
    console.log('Flutterwave init payment request received');

    // Only allow POST
    if (req.method !== 'POST') {
      throw new HttpError('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
    }

    // --- 1. Authenticate the user ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new HttpError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Authentication failed:', authError?.message);
      throw new HttpError('Invalid or expired authentication token', 401, 'UNAUTHORIZED');
    }

    console.log(`Processing payment initialization for user ${user.id}`);

    // Get user's profile and organization_id
    const { data: profile, error: profileError } = (await supabase
      .from('profiles' as never)
      .select('organization_id, first_name, last_name')
      .eq('user_id', user.id)
      .single()) as {
      data: { organization_id: string; first_name: string | null; last_name: string | null } | null;
      error: { message?: string } | null;
    };

    if (profileError || !profile?.organization_id) {
      console.error('Profile lookup failed:', profileError?.message);
      throw new HttpError('User profile or organization not found', 404, 'PROFILE_NOT_FOUND');
    }

    const organizationId = profile.organization_id;
    const customerName =
      [profile.first_name, profile.last_name].filter(Boolean).join(' ') || user.email;

    // --- 2. Parse and validate request body ---
    let body: InitPaymentRequest;
    try {
      body = await req.json();
    } catch {
      throw new HttpError('Invalid JSON payload', 400, 'INVALID_JSON');
    }

    const { plan_id, billing_interval, redirect_url } = body;

    if (!plan_id) {
      throw new HttpError('plan_id is required', 400, 'VALIDATION_ERROR');
    }

    if (!billing_interval || !['monthly', 'yearly'].includes(billing_interval)) {
      throw new HttpError(
        'billing_interval must be "monthly" or "yearly"',
        400,
        'VALIDATION_ERROR'
      );
    }

    // --- 3. Check for duplicate pending payment (idempotency) ---
    // Look for ANY pending transaction for this org, regardless of age.
    // This prevents users from creating multiple pending payments.
    const { data: existingTransactions } = (await supabase
      .from('payment_transactions' as never)
      .select('id, metadata, created_at')
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })) as {
      data: Array<{ id: string; metadata: Record<string, unknown>; created_at: string }> | null;
      error: { message?: string } | null;
    };

    if (existingTransactions && existingTransactions.length > 0) {
      const newest = existingTransactions[0];
      const ageMs = Date.now() - new Date(newest.created_at).getTime();
      const twoHoursMs = 2 * 60 * 60 * 1000;

      // If the newest pending transaction has a payment link and is under 2 hours old, reuse it
      if (newest.metadata?.payment_link && ageMs < twoHoursMs) {
        console.log(
          `Returning existing pending payment link for org ${organizationId}, plan ${plan_id}`
        );
        return createJsonResponse(
          {
            success: true,
            payment_link: newest.metadata.payment_link,
            transaction_id: newest.id,
            existing: true,
          },
          { status: 200, cors: corsOptions }
        );
      }

      // Expire any stale pending transactions before creating a new one
      const staleIds = existingTransactions.map((t) => t.id);
      if (staleIds.length > 0) {
        console.log(
          `Expiring ${staleIds.length} stale pending transaction(s) for org ${organizationId}`
        );
        for (const staleId of staleIds) {
          await supabase
            .from('payment_transactions' as never)
            .update({ status: 'failed', updated_at: new Date().toISOString() })
            .eq('id', staleId);
        }
      }
    }

    // --- 4. Look up the plan ---
    const { data: plan, error: planError } = (await supabase
      .from('user_plans' as never)
      .select('*')
      .eq('id', plan_id)
      .eq('is_active', true)
      .single()) as { data: Record<string, unknown> | null; error: { message?: string } | null };

    if (planError || !plan) {
      console.error('Plan lookup failed:', planError?.message);
      throw new HttpError('Plan not found or inactive', 404, 'PLAN_NOT_FOUND');
    }

    // Determine price and Flutterwave plan ID based on billing interval
    const amount =
      billing_interval === 'monthly'
        ? (plan.price_monthly as number)
        : (plan.price_yearly as number);
    const flutterwavePlanId =
      billing_interval === 'monthly'
        ? (plan.flutterwave_plan_id_monthly as string | undefined)
        : (plan.flutterwave_plan_id_yearly as string | undefined);

    if (!amount || amount <= 0) {
      throw new HttpError(
        `No ${billing_interval} price configured for this plan`,
        400,
        'PRICE_NOT_CONFIGURED'
      );
    }

    // --- 5. Generate deterministic tx_ref ---
    const orgIdShort = organizationId.substring(0, 8);
    const planIdShort = plan_id.substring(0, 8);
    const timestamp = Date.now();
    const txRef = `kourti_${orgIdShort}_${planIdShort}_${timestamp}`;

    // --- 6. Create pending transaction record ---
    const { data: transaction, error: txError } = (await supabase
      .from('payment_transactions' as never)
      .insert({
        organization_id: organizationId,
        flutterwave_tx_ref: txRef,
        amount: amount,
        currency: (plan.currency as string) || 'NGN',
        status: 'pending',
        payment_type: 'subscription',
        metadata: {
          plan_id: plan_id,
          user_id: user.id,
          billing_interval: billing_interval,
        },
      })
      .select('id')
      .single()) as { data: { id: string } | null; error: { message?: string } | null };

    if (txError || !transaction) {
      console.error('Failed to create transaction record:', txError?.message);
      throw new HttpError('Failed to create payment transaction', 500, 'TRANSACTION_CREATE_FAILED');
    }

    console.log(`Created pending transaction ${transaction.id} with tx_ref ${txRef}`);

    // --- 7. Initialize Flutterwave payment ---
    const defaultRedirectUrl = `${Deno.env.get('APP_URL') || 'https://app.kourti.com'}/billing/callback`;
    const paymentRedirectUrl = redirect_url || defaultRedirectUrl;

    const paymentPayload: Record<string, unknown> = {
      tx_ref: txRef,
      amount: amount,
      currency: (plan.currency as string) || 'NGN',
      redirect_url: paymentRedirectUrl,
      customer: {
        email: user.email,
        name: customerName,
      },
      customizations: {
        title: 'Kourti Legal',
        description: `Subscription to ${plan.display_name as string} (${billing_interval})`,
      },
    };

    // Include payment_plan for recurring billing if a Flutterwave plan ID exists
    if (flutterwavePlanId) {
      paymentPayload.payment_plan = flutterwavePlanId;
    }

    const paymentResponse = await initializePayment(paymentPayload as InitializePaymentParams);

    if (!paymentResponse?.data?.link) {
      console.error('Flutterwave did not return a payment link:', paymentResponse);
      throw new HttpError(
        'Failed to initialize payment with Flutterwave',
        502,
        'PAYMENT_INIT_FAILED'
      );
    }

    const paymentLink = paymentResponse.data.link;

    // --- 8. Update transaction metadata with the payment link (merge, don't overwrite) ---
    const { error: updateError } = await supabase
      .from('payment_transactions' as never)
      .update({
        metadata: {
          plan_id: plan_id,
          user_id: user.id,
          billing_interval: billing_interval,
          payment_link: paymentLink,
          flutterwave_response: paymentResponse.data,
        },
      })
      .eq('id', transaction.id);

    if (updateError) {
      console.error('Failed to update transaction metadata:', updateError.message);
      // Non-fatal: we still have the payment link to return
    }

    console.log(`Payment initialized successfully for transaction ${transaction.id}`);

    // --- 9. Return payment link to frontend ---
    return createJsonResponse(
      {
        success: true,
        payment_link: paymentLink,
        transaction_id: transaction.id,
        tx_ref: txRef,
      },
      { status: 200, cors: corsOptions }
    );
  } catch (error: unknown) {
    if (error instanceof HttpError) {
      return createHttpErrorResponse(error, corsOptions);
    }
    return createErrorResponse(error, corsOptions, {
      function: 'flutterwave-init-payment',
    });
  }
});
