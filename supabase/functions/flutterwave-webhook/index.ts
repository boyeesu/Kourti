declare const Deno: {
  env: { get(key: string): string | undefined };
};

// @ts-expect-error: Deno module
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
// @ts-expect-error: Deno module
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { createCorsSecurityHeaders } from '../_shared/responseHeaders.ts';
import { logError } from '../_shared/errorHandling.ts';
import { verifyWebhookSignature, verifyTransaction } from '../_shared/flutterwaveClient.ts';

const corsOptions = {
  origin: '*',
  allowMethods: ['POST', 'OPTIONS'],
};

/** Minimal Supabase client interface used throughout this module. */
type SupabaseClient = ReturnType<typeof createClient>;

/** Shape of webhook event data from Flutterwave. */
interface WebhookEventData {
  id?: number | string;
  tx_ref?: string;
  flw_ref?: string;
  payment_plan?: string | number;
  [key: string]: unknown;
}

/**
 * Record a webhook event for idempotency and debugging.
 * Returns the inserted row, or null if this event was already processed.
 */
async function recordWebhookEvent(
  supabase: SupabaseClient,
  eventType: string,
  flutterwaveRef: string,
  payload: unknown
): Promise<{ id: string; alreadyProcessed: boolean }> {
  // Check if this event was already recorded
  const { data: existing } = await supabase
    .from('webhook_events')
    .select('id, processed')
    .eq('flutterwave_ref', flutterwaveRef)
    .eq('event_type', eventType)
    .maybeSingle();

  if (existing) {
    return { id: existing.id, alreadyProcessed: existing.processed };
  }

  // Insert new webhook event record
  const { data: inserted, error: insertError } = await supabase
    .from('webhook_events')
    .insert({
      event_type: eventType,
      flutterwave_ref: flutterwaveRef,
      payload,
      processed: false,
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('Failed to record webhook event:', insertError);
    throw new Error(`Failed to record webhook event: ${insertError.message}`);
  }

  return { id: inserted.id, alreadyProcessed: false };
}

/**
 * Mark a webhook event as processed.
 */
async function markEventProcessed(supabase: SupabaseClient, eventId: string): Promise<void> {
  const { error } = await supabase
    .from('webhook_events')
    .update({ processed: true, processed_at: new Date().toISOString() })
    .eq('id', eventId);

  if (error) {
    console.error('Failed to mark webhook event as processed:', error);
  }
}

/**
 * Handle charge.completed event.
 * Re-verifies the transaction via Flutterwave API before updating DB.
 */
async function handleChargeCompleted(
  supabase: SupabaseClient,
  data: WebhookEventData,
  eventId: string
): Promise<void> {
  const txRef = data.tx_ref;
  const transactionId = String(data.id);

  // SECURITY: Always re-verify transaction via Flutterwave API
  const verification = await verifyTransaction(transactionId);

  if (verification.status !== 'successful') {
    console.warn(
      `Transaction verification failed for tx_ref=${txRef}, id=${transactionId}. ` +
        `API status: ${verification.status}. Skipping DB update.`
    );
    await markEventProcessed(supabase, eventId);
    return;
  }

  // SECURITY: Cross-check that the verified transaction's tx_ref matches the webhook payload
  if (verification.data && verification.data.tx_ref !== txRef) {
    console.error(
      `tx_ref mismatch: webhook claimed tx_ref=${txRef}, ` +
        `but Flutterwave API returned tx_ref=${verification.data.tx_ref}. ` +
        `Possible forgery attempt. Skipping.`
    );
    await markEventProcessed(supabase, eventId);
    return;
  }

  // Update payment_transactions with verified data
  const { data: txRecord, error: txUpdateError } = await supabase
    .from('payment_transactions')
    .update({
      status: 'successful',
      flutterwave_tx_id: String(transactionId),
      updated_at: new Date().toISOString(),
    })
    .eq('flutterwave_tx_ref', txRef)
    .select('id, organization_id, metadata')
    .single();

  if (txUpdateError) {
    console.error(`Failed to update payment_transactions for tx_ref=${txRef}:`, txUpdateError);
    throw new Error(`Failed to update payment transaction: ${txUpdateError.message}`);
  }

  // If transaction record exists, manage subscription
  if (txRecord) {
    const meta = (txRecord.metadata || {}) as Record<string, unknown>;
    const planId = meta.plan_id as string | undefined;
    const userId = meta.user_id as string | undefined;
    const billingInterval = (meta.billing_interval as string) || 'monthly';

    const now = new Date();
    const periodEnd = new Date(now);

    if (billingInterval === 'yearly') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    if (planId && userId) {
      // Look up user's email for the subscription record
      const { data: userData } = await supabase.auth.admin.getUserById(userId);
      const customerEmail = userData?.user?.email || 'unknown@unknown.com';

      // Check for existing active subscription for this org
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
        // Update existing subscription
        const { data: updated, error: updateErr } = await supabase
          .from('subscriptions')
          .update({
            plan_id: planId,
            flutterwave_subscription_id: data.payment_plan ? String(data.payment_plan) : null,
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
          console.error('Failed to update subscription:', updateErr);
          throw new Error(`Failed to update subscription: ${updateErr?.message}`);
        }
        subRecord = updated;
      } else {
        // Create new subscription
        const { data: inserted, error: insertErr } = await supabase
          .from('subscriptions')
          .insert({
            organization_id: txRecord.organization_id,
            user_id: userId,
            plan_id: planId,
            flutterwave_subscription_id: data.payment_plan ? String(data.payment_plan) : null,
            flutterwave_customer_email: customerEmail,
            billing_interval: billingInterval,
            status: 'active',
            current_period_start: now.toISOString(),
            current_period_end: periodEnd.toISOString(),
          })
          .select('id')
          .single();

        if (insertErr || !inserted) {
          console.error('Failed to insert subscription:', insertErr);
          throw new Error(`Failed to insert subscription: ${insertErr?.message}`);
        }
        subRecord = inserted;
      }

      // Link the transaction to the subscription
      await supabase
        .from('payment_transactions')
        .update({ subscription_id: subRecord.id })
        .eq('id', txRecord.id);

      // Atomically sync user_plan_assignments via RPC
      const { error: rpcError } = await supabase.rpc('handle_subscription_change', {
        p_subscription_id: subRecord.id,
        p_new_status: 'active',
        p_plan_id: planId,
        p_current_period_start: now.toISOString(),
        p_current_period_end: periodEnd.toISOString(),
      });

      if (rpcError) {
        console.error('Failed to call handle_subscription_change RPC:', rpcError);
        throw new Error(`Failed to sync user plan assignments: ${rpcError.message}`);
      }
    }
  }

  await markEventProcessed(supabase, eventId);
  console.log(`charge.completed processed successfully for tx_ref=${txRef}`);
}

/**
 * Handle charge.failed event.
 */
async function handleChargeFailed(
  supabase: SupabaseClient,
  data: WebhookEventData,
  eventId: string
): Promise<void> {
  const txRef = data.tx_ref;

  // Update payment_transactions status to failed
  const { data: txRecord, error: txUpdateError } = await supabase
    .from('payment_transactions')
    .update({
      status: 'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('flutterwave_tx_ref', txRef)
    .select('organization_id')
    .single();

  if (txUpdateError) {
    console.error(`Failed to update payment_transactions for tx_ref=${txRef}:`, txUpdateError);
    // Don't throw — still mark event as processed
  }

  // If there's an active subscription for this org, set to past_due
  if (txRecord?.organization_id) {
    const { error: subError } = await supabase
      .from('subscriptions')
      .update({
        status: 'past_due',
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', txRecord.organization_id)
      .eq('status', 'active');

    if (subError) {
      console.error('Failed to update subscription to past_due:', subError);
    }
  }

  await markEventProcessed(supabase, eventId);
  console.log(`charge.failed processed for tx_ref=${txRef}`);
}

/**
 * Handle subscription.cancelled event.
 */
async function handleSubscriptionCancelled(
  supabase: SupabaseClient,
  data: WebhookEventData,
  eventId: string
): Promise<void> {
  const paymentPlanId = String(data.id || data.payment_plan);

  // Find and cancel the subscription
  const { data: subscription, error: subFetchError } = await supabase
    .from('subscriptions')
    .select('id, organization_id, plan_id')
    .eq('flutterwave_subscription_id', paymentPlanId)
    .single();

  if (subFetchError || !subscription) {
    console.warn(
      `No subscription found for payment_plan_id=${paymentPlanId}. May already be cancelled.`
    );
    await markEventProcessed(supabase, eventId);
    return;
  }

  // Update subscription status to cancelled
  const { error: subUpdateError } = await supabase
    .from('subscriptions')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', subscription.id);

  if (subUpdateError) {
    console.error('Failed to cancel subscription:', subUpdateError);
    throw new Error(`Failed to cancel subscription: ${subUpdateError.message}`);
  }

  // Revoke user plan assignments via RPC
  const { error: rpcError } = await supabase.rpc('handle_subscription_change', {
    p_subscription_id: subscription.id,
    p_new_status: 'cancelled',
    p_plan_id: subscription.plan_id,
    p_cancelled_at: new Date().toISOString(),
  });

  if (rpcError) {
    console.error('Failed to call handle_subscription_change RPC for cancellation:', rpcError);
  }

  await markEventProcessed(supabase, eventId);
  console.log(`subscription.cancelled processed for payment_plan_id=${paymentPlanId}`);
}

const handler = async (req: Request): Promise<Response> => {
  console.log('flutterwave-webhook function invoked');

  const headers = createCorsSecurityHeaders(corsOptions);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers });
  }

  try {
    // SECURITY: Verify webhook signature
    const hash = req.headers.get('verif-hash');
    const secretHash = Deno.env.get('FLUTTERWAVE_WEBHOOK_HASH');

    if (!hash || !secretHash || !verifyWebhookSignature(secretHash, hash)) {
      console.warn('Webhook signature verification failed');
      return new Response('Unauthorized', { status: 401, headers });
    }

    // Parse webhook payload
    const body = await req.json();
    const { event, data } = body;

    if (!event || !data) {
      console.warn('Invalid webhook payload: missing event or data');
      return new Response(JSON.stringify({ status: 'invalid payload' }), {
        status: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    console.log(
      `Processing webhook event: ${event}, tx_ref=${data.tx_ref || 'N/A'}, id=${data.id || 'N/A'}`
    );

    // Initialize Supabase client with service role (server-to-server)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Determine the reference for idempotency
    const flutterwaveRef = data.tx_ref || data.flw_ref || String(data.id);

    // Record webhook event for idempotency and debugging
    const { id: eventId, alreadyProcessed } = await recordWebhookEvent(
      supabase,
      event,
      flutterwaveRef,
      body
    );

    if (alreadyProcessed) {
      console.log(`Event already processed: ${event} ref=${flutterwaveRef}. Returning 200.`);
      return new Response(JSON.stringify({ status: 'already processed' }), {
        status: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // Route to event handler
    switch (event) {
      case 'charge.completed':
        await handleChargeCompleted(supabase, data, eventId);
        break;

      case 'charge.failed':
        await handleChargeFailed(supabase, data, eventId);
        break;

      case 'subscription.cancelled':
        await handleSubscriptionCancelled(supabase, data, eventId);
        break;

      default:
        console.log(`Unknown webhook event: ${event}. Marking as processed.`);
        await markEventProcessed(supabase, eventId);
        break;
    }

    return new Response(JSON.stringify({ status: 'success' }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    // IMPORTANT: Always return 200 to Flutterwave to prevent retry flooding
    logError(error, { function: 'flutterwave-webhook' });
    return new Response(JSON.stringify({ status: 'received' }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }
};

serve(handler);
