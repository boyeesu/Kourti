declare const Deno: {
  env: { get(key: string): string | undefined };
};

// @ts-expect-error: Deno module
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
// @ts-expect-error: Deno module
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
  createEmptyResponse,
  createJsonResponse,
  CorsSecurityHeadersOptions,
} from '../_shared/responseHeaders.ts';
import { createErrorResponse } from '../_shared/errorHandling.ts';
import { HttpError, createErrorResponse as createHttpErrorResponse } from '../_shared/httpError.ts';
import { verifyTransaction } from '../_shared/flutterwaveClient.ts';
import { sendPlanConfirmationEmail } from '../_shared/planConfirmationEmail.ts';

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

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface VerifyPaymentRequest {
  tx_ref: string;
}

serve(async (req: Request) => {
  const requestOrigin = req.headers.get('Origin');
  const corsOptions = getCorsOptions(requestOrigin);

  if (req.method === 'OPTIONS') {
    return createEmptyResponse({ status: 204, cors: corsOptions });
  }

  try {
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
      throw new HttpError('Invalid or expired authentication token', 401, 'UNAUTHORIZED');
    }

    // --- 2. Parse request ---
    let body: VerifyPaymentRequest;
    try {
      body = await req.json();
    } catch {
      throw new HttpError('Invalid JSON payload', 400, 'INVALID_JSON');
    }

    const { tx_ref } = body;
    if (!tx_ref) {
      throw new HttpError('tx_ref is required', 400, 'VALIDATION_ERROR');
    }

    console.log(`Verifying payment for tx_ref=${tx_ref}, user=${user.id}`);

    // --- 3. Look up the pending transaction ---
    const { data: txRecord, error: txError } = await supabase
      .from('payment_transactions')
      .select('id, organization_id, status, flutterwave_tx_id, metadata')
      .eq('flutterwave_tx_ref', tx_ref)
      .single();

    if (txError || !txRecord) {
      throw new HttpError('Transaction not found', 404, 'NOT_FOUND');
    }

    // If already successful, return current state
    if (txRecord.status === 'successful') {
      // Fetch the subscription for this org
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('id, status, plan_id')
        .eq('organization_id', txRecord.organization_id)
        .in('status', ['active', 'trialing'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return createJsonResponse(
        {
          success: true,
          payment_status: 'successful',
          subscription_status: sub?.status || null,
          already_processed: true,
        },
        { status: 200, cors: corsOptions }
      );
    }

    // Only verify pending transactions
    if (txRecord.status !== 'pending') {
      return createJsonResponse(
        {
          success: true,
          payment_status: txRecord.status,
          subscription_status: null,
          already_processed: true,
        },
        { status: 200, cors: corsOptions }
      );
    }

    // --- 4. Query Flutterwave to find the transaction by tx_ref ---
    // Use the transactions list endpoint filtered by tx_ref
    const flwSecretKey = Deno.env.get('FLUTTERWAVE_SECRET_KEY');
    if (!flwSecretKey) {
      throw new HttpError('Payment verification unavailable', 503, 'CONFIG_ERROR');
    }

    const verifyUrl = `https://api.flutterwave.com/v3/transactions?tx_ref=${encodeURIComponent(tx_ref)}`;
    const flwResponse = await fetch(verifyUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${flwSecretKey}`,
        'Content-Type': 'application/json',
      },
    });

    const flwResult = await flwResponse.json();

    if (flwResult.status !== 'success' || !flwResult.data || flwResult.data.length === 0) {
      // No transaction found on Flutterwave side yet — still pending
      return createJsonResponse(
        {
          success: true,
          payment_status: 'pending',
          subscription_status: null,
          message: 'Payment is still being processed by Flutterwave',
        },
        { status: 200, cors: corsOptions }
      );
    }

    const flwTransaction = flwResult.data[0];
    const transactionId = String(flwTransaction.id);

    // --- 5. Verify the transaction ---
    const verification = await verifyTransaction(transactionId);

    if (verification.status !== 'success' || verification.data?.status !== 'successful') {
      // Transaction exists but not successful
      const flwStatus = verification.data?.status || 'unknown';

      if (flwStatus === 'failed') {
        await supabase
          .from('payment_transactions')
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .eq('id', txRecord.id);
      }

      return createJsonResponse(
        {
          success: true,
          payment_status: flwStatus === 'failed' ? 'failed' : 'pending',
          subscription_status: null,
        },
        { status: 200, cors: corsOptions }
      );
    }

    // --- 6. Transaction is successful — update DB (same logic as webhook) ---
    console.log(`Transaction ${transactionId} verified as successful for tx_ref=${tx_ref}`);

    // Cross-check tx_ref
    if (verification.data && verification.data.tx_ref !== tx_ref) {
      console.error(`tx_ref mismatch: expected ${tx_ref}, got ${verification.data.tx_ref}`);
      throw new HttpError('Transaction verification mismatch', 400, 'VERIFICATION_MISMATCH');
    }

    // Update payment_transactions
    await supabase
      .from('payment_transactions')
      .update({
        status: 'successful',
        flutterwave_tx_id: transactionId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', txRecord.id);

    // Create/update subscription
    const meta = (txRecord.metadata || {}) as Record<string, unknown>;
    const planId = meta.plan_id as string | undefined;
    const userId = meta.user_id as string | undefined;
    const billingInterval = (meta.billing_interval as string) || 'monthly';

    if (!planId || !userId) {
      return createJsonResponse(
        {
          success: true,
          payment_status: 'successful',
          subscription_status: null,
          message: 'Payment verified but missing plan/user metadata',
        },
        { status: 200, cors: corsOptions }
      );
    }

    const now = new Date();
    const periodEnd = new Date(now);
    if (billingInterval === 'yearly') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    // Look up user email
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    const customerEmail = userData?.user?.email || 'unknown@unknown.com';

    // Check for existing subscription
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('organization_id', txRecord.organization_id)
      .in('status', ['active', 'trialing', 'past_due'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let subRecord: { id: string };

    if (existingSub) {
      const { data: updated, error: updateErr } = await supabase
        .from('subscriptions')
        .update({
          plan_id: planId,
          billing_interval: billingInterval,
          status: 'active',
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', existingSub.id)
        .select('id')
        .single();

      if (updateErr || !updated) {
        throw new HttpError('Failed to update subscription', 500, 'INTERNAL_ERROR');
      }
      subRecord = updated;
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from('subscriptions')
        .insert({
          organization_id: txRecord.organization_id,
          user_id: userId,
          plan_id: planId,
          flutterwave_customer_email: customerEmail,
          billing_interval: billingInterval,
          status: 'active',
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
        })
        .select('id')
        .single();

      if (insertErr || !inserted) {
        throw new HttpError('Failed to create subscription', 500, 'INTERNAL_ERROR');
      }
      subRecord = inserted;
    }

    // Link transaction to subscription
    await supabase
      .from('payment_transactions')
      .update({ subscription_id: subRecord.id })
      .eq('id', txRecord.id);

    // Sync plan assignments via RPC
    const { error: rpcError } = await supabase.rpc('handle_subscription_change', {
      p_subscription_id: subRecord.id,
      p_new_status: 'active',
      p_plan_id: planId,
      p_current_period_start: now.toISOString(),
      p_current_period_end: periodEnd.toISOString(),
    });

    if (rpcError) {
      console.error('Failed to call handle_subscription_change RPC:', rpcError);
    }

    // Cancel any other pending transactions for this org to prevent double billing
    const { error: cleanupError } = await supabase
      .from('payment_transactions')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('organization_id', txRecord.organization_id)
      .eq('status', 'pending')
      .neq('id', txRecord.id);

    if (cleanupError) {
      console.warn('Failed to clean up other pending transactions:', cleanupError);
    }

    console.log(`Payment verified and subscription activated for tx_ref=${tx_ref}`);

    // Send plan purchase/renewal confirmation email
    await sendPlanConfirmationEmail({
      supabase,
      userId,
      planId,
      organizationId: txRecord.organization_id,
      billingInterval,
      isRenewal: !!existingSub,
      transactionRef: tx_ref,
      amount: verification.data?.amount,
      currency: verification.data?.currency,
    });

    return createJsonResponse(
      {
        success: true,
        payment_status: 'successful',
        subscription_status: 'active',
        subscription_id: subRecord.id,
      },
      { status: 200, cors: corsOptions }
    );
  } catch (error: unknown) {
    if (error instanceof HttpError) {
      return createHttpErrorResponse(error, corsOptions);
    }
    return createErrorResponse(error, corsOptions, {
      function: 'flutterwave-verify-payment',
    });
  }
});
