declare const Deno: {
  env: { get(key: string): string | undefined };
};

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { createJsonResponse, CorsSecurityHeadersOptions } from '../_shared/responseHeaders.ts';
import { createErrorResponse } from '../_shared/errorHandling.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsOptions: CorsSecurityHeadersOptions = {
  origin: '*',
  allowMethods: ['POST', 'OPTIONS'],
};

/**
 * Expire Cancelled Subscriptions
 *
 * Finds subscriptions where cancel_at_period_end = true and
 * current_period_end has passed, then transitions them to 'cancelled'
 * status and revokes plan access via the handle_subscription_change RPC.
 *
 * Designed to be invoked daily by pg_cron.
 */
const handler = async (req: Request): Promise<Response> => {
  console.log('expire-cancelled-subscriptions function invoked');

  if (req.method === 'OPTIONS') {
    return createJsonResponse(null, { status: 204, cors: corsOptions });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.includes(supabaseServiceKey)) {
      return createJsonResponse({ error: 'Unauthorized' }, { status: 401, cors: corsOptions });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find active subscriptions that are past their cancellation period
    const { data: expiredSubs, error: fetchError } = await supabase
      .from('subscriptions')
      .select(
        'id, organization_id, user_id, plan_id, current_period_end, flutterwave_subscription_id'
      )
      .eq('status', 'active')
      .eq('cancel_at_period_end', true)
      .lt('current_period_end', new Date().toISOString());

    if (fetchError) {
      console.error('Failed to fetch expired subscriptions:', fetchError);
      throw new Error(`Failed to fetch expired subscriptions: ${fetchError.message}`);
    }

    if (!expiredSubs || expiredSubs.length === 0) {
      console.log('No expired subscriptions to process.');
      return createJsonResponse({ success: true, processed: 0 }, { cors: corsOptions });
    }

    console.log(`Found ${expiredSubs.length} expired subscription(s) to process.`);

    let processed = 0;
    const errors: string[] = [];

    for (const sub of expiredSubs) {
      try {
        // Use the existing RPC to atomically cancel subscription and revoke plan access
        const { error: rpcError } = await supabase.rpc('handle_subscription_change', {
          p_subscription_id: sub.id,
          p_new_status: 'cancelled',
          p_plan_id: sub.plan_id,
          p_cancelled_at: new Date().toISOString(),
        });

        if (rpcError) {
          console.error(`Failed to expire subscription ${sub.id}:`, rpcError);
          errors.push(`${sub.id}: ${rpcError.message}`);
          continue;
        }

        console.log(`Expired subscription ${sub.id} for org ${sub.organization_id}`);
        processed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error processing subscription ${sub.id}:`, msg);
        errors.push(`${sub.id}: ${msg}`);
      }
    }

    console.log(`Processed ${processed}/${expiredSubs.length} expired subscriptions.`);

    return createJsonResponse(
      {
        success: true,
        processed,
        total: expiredSubs.length,
        errors: errors.length > 0 ? errors : undefined,
      },
      { cors: corsOptions }
    );
  } catch (error) {
    console.error('expire-cancelled-subscriptions error:', error);
    return createErrorResponse(error, corsOptions, {
      function: 'expire-cancelled-subscriptions',
    });
  }
};

serve(handler);
