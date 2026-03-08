-- Migration: Set up cron job for processing event reminders
-- This cron job runs every minute to check for due reminders and send notifications

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT USAGE ON SCHEMA net TO postgres;

-- Drop existing cron job if it exists (for idempotency)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-event-reminders') THEN
    PERFORM cron.unschedule('process-event-reminders');
    RAISE NOTICE 'Dropped existing process-event-reminders cron job';
  END IF;
END $$;

-- Create a function to call the edge function via HTTP
-- This function will be called by the cron job
CREATE OR REPLACE FUNCTION call_process_event_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  project_ref text;
  service_role_key text;
  function_url text;
  response_id bigint;
BEGIN
  -- Get project reference from current database name or environment
  -- For Supabase Cloud, this should be set via environment variable
  -- For local development, you may need to set this manually
  project_ref := current_setting('app.settings.project_ref', true);
  
  -- Get service role key (should be set as a secret/parameter)
  service_role_key := current_setting('app.settings.service_role_key', true);
  
  -- If not set via settings, try to construct from database name
  IF project_ref IS NULL OR project_ref = '' THEN
    -- Try to extract from database name (Supabase pattern: postgres.[ref])
    SELECT substring(current_database() from '\.([^.]+)$') INTO project_ref;
  END IF;
  
  -- Construct function URL
  IF project_ref IS NOT NULL AND project_ref != '' THEN
    function_url := format('https://%s.supabase.co/functions/v1/process-event-reminders', project_ref);
  ELSE
    -- Fallback: use environment variable or default
    function_url := current_setting('app.settings.functions_url', true);
    IF function_url IS NULL OR function_url = '' THEN
      RAISE WARNING 'Could not determine function URL. Please set app.settings.project_ref or app.settings.functions_url';
      RETURN;
    END IF;
  END IF;
  
  -- Call the edge function via HTTP
  SELECT net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', format('Bearer %s', COALESCE(service_role_key, ''))
    ),
    body := '{}'::jsonb
  ) INTO response_id;
  
  RAISE NOTICE 'Called process-event-reminders function, response_id: %', response_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to call process-event-reminders: %', SQLERRM;
END;
$$;

-- Schedule the cron job to run every minute
-- Note: For Supabase Cloud, you may need to set this up via Dashboard instead
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Schedule the job
    PERFORM cron.schedule(
      'process-event-reminders',
      '* * * * *', -- Every minute
      'SELECT call_process_event_reminders();'
    );
    RAISE NOTICE 'Scheduled process-event-reminders cron job to run every minute';
  ELSE
    RAISE NOTICE 'pg_cron extension not available. Please set up cron job via Supabase Dashboard > Database > Cron Jobs';
  END IF;
END $$;

-- Add helpful comments
COMMENT ON FUNCTION call_process_event_reminders() IS 
'Calls the process-event-reminders edge function via HTTP.
This function is scheduled to run every minute via pg_cron.

To set up manually (if cron didn''t work):
1. Go to Supabase Dashboard > Database > Cron Jobs
2. Create new cron job:
   - Name: process-event-reminders
   - Schedule: * * * * * (every minute)
   - Command: SELECT call_process_event_reminders();
   
Or call the edge function directly:
   SELECT net.http_post(
     url := ''https://[PROJECT_REF].supabase.co/functions/v1/process-event-reminders'',
     headers := jsonb_build_object(''Authorization'', ''Bearer [SERVICE_ROLE_KEY]'')
   );';

-- Create event_reminders table if it doesn't exist (from earlier migration)
-- This ensures the table exists before creating the view
CREATE TABLE IF NOT EXISTS public.event_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Reminder timing
  reminder_type text NOT NULL CHECK (reminder_type IN ('before', 'at')),
  reminder_minutes integer NOT NULL DEFAULT 15,
  
  -- Reminder status
  sent boolean DEFAULT false,
  sent_at timestamptz,
  
  -- Notification method
  notification_method text NOT NULL DEFAULT 'in_app' CHECK (notification_method IN ('in_app', 'email', 'both')),
  
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_event_reminders_event_id ON public.event_reminders(event_id);
CREATE INDEX IF NOT EXISTS idx_event_reminders_user_id ON public.event_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_event_reminders_sent ON public.event_reminders(sent);
CREATE INDEX IF NOT EXISTS idx_event_reminders_org_id ON public.event_reminders(organization_id);

-- Enable RLS if not already enabled
ALTER TABLE public.event_reminders ENABLE ROW LEVEL SECURITY;

-- Create RLS policies if they don't exist (from earlier migration)
DO $$
BEGIN
  -- Policy: Users can view reminders for their events
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'event_reminders' 
    AND policyname = 'Users can view reminders for their events'
  ) THEN
    CREATE POLICY "Users can view reminders for their events"
      ON public.event_reminders
      FOR SELECT
      TO authenticated
      USING (
        user_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM public.calendar_events ce
          WHERE ce.id = event_reminders.event_id
          AND ce.organization_id = get_current_user_organization_id()
        )
      );
  END IF;

  -- Policy: Users can create reminders for their events
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'event_reminders' 
    AND policyname = 'Users can create reminders for their events'
  ) THEN
    CREATE POLICY "Users can create reminders for their events"
      ON public.event_reminders
      FOR INSERT
      TO authenticated
      WITH CHECK (
        user_id = auth.uid() AND
        EXISTS (
          SELECT 1 FROM public.calendar_events ce
          WHERE ce.id = event_reminders.event_id
          AND ce.organization_id = get_current_user_organization_id()
        )
      );
  END IF;

  -- Policy: Users can update their own reminders
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'event_reminders' 
    AND policyname = 'Users can update their own reminders'
  ) THEN
    CREATE POLICY "Users can update their own reminders"
      ON public.event_reminders
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  -- Policy: Users can delete their own reminders
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'event_reminders' 
    AND policyname = 'Users can delete their own reminders'
  ) THEN
    CREATE POLICY "Users can delete their own reminders"
      ON public.event_reminders
      FOR DELETE
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_reminders TO authenticated;

-- Create a view to monitor reminder processing status
CREATE OR REPLACE VIEW event_reminders_status AS
SELECT 
  COUNT(*) FILTER (WHERE sent = false) as pending_count,
  COUNT(*) FILTER (WHERE sent = true) as sent_count,
  COUNT(*) FILTER (WHERE sent = false AND 
    (reminder_type = 'before' AND 
     (SELECT start_date FROM calendar_events WHERE id = event_reminders.event_id) - 
     (reminder_minutes || ' minutes')::interval <= now() + interval '1 minute') OR
    (reminder_type = 'at' AND 
     (SELECT start_date FROM calendar_events WHERE id = event_reminders.event_id) <= now() + interval '1 minute')
  ) as due_count
FROM event_reminders;

COMMENT ON VIEW event_reminders_status IS 
'View showing reminder processing status:
- pending_count: Reminders not yet sent
- sent_count: Reminders already sent
- due_count: Reminders that should be processed now';
