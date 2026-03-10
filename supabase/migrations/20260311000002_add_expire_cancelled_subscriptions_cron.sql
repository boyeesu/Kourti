-- Migration: Add cron job to expire cancelled subscriptions
-- Runs daily at 2:00 AM UTC to find subscriptions where
-- cancel_at_period_end = true and current_period_end has passed,
-- then transitions them to 'cancelled' via the expire-cancelled-subscriptions
-- edge function which calls handle_subscription_change RPC.

-- Ensure extensions are available
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Performance index for the expiration query
CREATE INDEX IF NOT EXISTS idx_subscriptions_cancel_expiry
  ON public.subscriptions (current_period_end)
  WHERE status = 'active' AND cancel_at_period_end = true;

-- Schedule the cron job: daily at 2:00 AM UTC
SELECT cron.schedule(
  'expire-cancelled-subscriptions',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/expire-cancelled-subscriptions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
