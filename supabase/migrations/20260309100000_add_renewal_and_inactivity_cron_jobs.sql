-- Migration: Add cron jobs for renewal reminder and inactivity emails
-- These use pg_cron + pg_net to invoke Supabase Edge Functions on a schedule.

-- ============================================================================
-- Ensure email_delivery_logs table exists (may not have been applied yet)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.email_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,

  -- Email details
  recipient_email text NOT NULL,
  subject text NOT NULL,
  email_type text NOT NULL,

  -- Delivery status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
  provider_message_id text,
  provider_response jsonb,

  -- Retry information
  retry_count integer DEFAULT 0,
  last_retry_at timestamptz,
  max_retries integer DEFAULT 3,

  -- Error tracking
  error_message text,
  error_stack text,

  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  delivered_at timestamptz
);

-- Make organization_id nullable if it was previously NOT NULL
-- (needed for system-level emails where user may not have an org)
ALTER TABLE public.email_delivery_logs
  ALTER COLUMN organization_id DROP NOT NULL;

-- Enable RLS
ALTER TABLE public.email_delivery_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies (idempotent with IF NOT EXISTS via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'email_delivery_logs'
      AND policyname = 'Users can view their own email delivery logs'
  ) THEN
    CREATE POLICY "Users can view their own email delivery logs"
      ON public.email_delivery_logs
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;

  -- Service role needs full access for edge functions
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'email_delivery_logs'
      AND policyname = 'Service role has full access to email delivery logs'
  ) THEN
    CREATE POLICY "Service role has full access to email delivery logs"
      ON public.email_delivery_logs
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

-- Indexes for email_delivery_logs
CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_user_id ON public.email_delivery_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_status ON public.email_delivery_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_created_at ON public.email_delivery_logs(created_at DESC);

-- Grant permissions
GRANT SELECT ON public.email_delivery_logs TO authenticated;
GRANT ALL ON public.email_delivery_logs TO service_role;

-- ============================================================================
-- Performance indexes for the new email jobs
-- ============================================================================

-- Index for inactivity queries on profiles.last_login_at
CREATE INDEX IF NOT EXISTS idx_profiles_last_login_at
  ON public.profiles (last_login_at)
  WHERE status = 'active' AND disabled_at IS NULL;

-- Index for expiring plan queries
CREATE INDEX IF NOT EXISTS idx_user_plan_assignments_expires_at
  ON public.user_plan_assignments (expires_at)
  WHERE status = 'active' AND expires_at IS NOT NULL;

-- Index for deduplication lookups on email_delivery_logs
CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_dedup
  ON public.email_delivery_logs (user_id, email_type, created_at DESC);

-- ============================================================================
-- Cron Jobs (pg_cron + pg_net)
-- ============================================================================
-- NOTE: pg_cron and pg_net must be enabled on your Supabase project.
-- On hosted Supabase, enable them via Dashboard > Database > Extensions.
-- The cron jobs below use the Supabase project URL and service role key
-- from Vault secrets. If pg_cron is not available, these will fail silently
-- and you can set up the schedules via an external scheduler instead.

-- Enable extensions (no-op if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Renewal Reminder Email: daily at 9:00 AM UTC
SELECT cron.schedule(
  'send-renewal-reminder-emails',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/send-renewal-reminder-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Inactivity Email: daily at 10:00 AM UTC
SELECT cron.schedule(
  'send-inactivity-emails',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/send-inactivity-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
