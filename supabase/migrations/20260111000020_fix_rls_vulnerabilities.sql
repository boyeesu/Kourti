-- Migration: Fix RLS vulnerabilities detected by Supabase database linter
--
-- Issues addressed:
-- 1. policy_exists_rls_disabled on public.invitation_update_jobs
--    - Policies exist ("Trigger can insert jobs") but RLS is not enabled
-- 2. policy_exists_rls_disabled on public.profiles
--    - Policies exist ("System can insert profiles", profiles_select, profiles_update) but RLS is not enabled
-- 3. rls_disabled_in_public on public.profiles
--    - Table is public but RLS has not been enabled
-- 4. rls_disabled_in_public on public.invitation_update_jobs
--    - Table is public but RLS has not been enabled
-- 5. security_definer_view on public.event_reminders_status
--    - View defined with SECURITY DEFINER property (uses definer's permissions instead of invoker's)

-- =============================================================================
-- Fix 1 & 4: Enable RLS on invitation_update_jobs table
-- =============================================================================
-- This table stores background jobs for updating invitation status
-- It already has policies defined but RLS was never enabled

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'invitation_update_jobs'
  ) THEN
    ALTER TABLE public.invitation_update_jobs ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE 'Enabled RLS on invitation_update_jobs table';
  ELSE
    RAISE NOTICE 'invitation_update_jobs table does not exist, skipping';
  END IF;
END $$;

-- Ensure the existing policy is properly set up for INSERT operations
-- This policy allows the trigger to insert jobs during signup
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'invitation_update_jobs'
  ) THEN
    -- Drop and recreate to ensure correct configuration
    DROP POLICY IF EXISTS "Trigger can insert jobs" ON public.invitation_update_jobs;

    -- Allow the service role (used by triggers) to insert jobs
    -- Note: SECURITY DEFINER functions bypass RLS by default
    CREATE POLICY "Trigger can insert jobs" ON public.invitation_update_jobs
      FOR INSERT
      WITH CHECK (true);

    -- Add policy for service role to update job status during processing
    DROP POLICY IF EXISTS "Service role can update jobs" ON public.invitation_update_jobs;
    CREATE POLICY "Service role can update jobs" ON public.invitation_update_jobs
      FOR UPDATE
      USING (true)
      WITH CHECK (true);

    -- Add policy for service role to select jobs for processing
    DROP POLICY IF EXISTS "Service role can select jobs" ON public.invitation_update_jobs;
    CREATE POLICY "Service role can select jobs" ON public.invitation_update_jobs
      FOR SELECT
      USING (true);

    RAISE NOTICE 'Configured RLS policies on invitation_update_jobs table';
  END IF;
END $$;

-- =============================================================================
-- Fix 2 & 3: Enable RLS on profiles table
-- =============================================================================
-- This table stores user profile information
-- It has policies but RLS was somehow disabled

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'profiles'
  ) THEN
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE 'Enabled RLS on profiles table';
  END IF;
END $$;

-- Ensure existing policies are properly configured
-- The profiles table should have:
-- 1. System can insert profiles - for new user creation trigger
-- 2. profiles_select - for authenticated users to read profiles in their org
-- 3. profiles_update - for users to update their own profile

-- Verify and fix the insert policy for system/trigger operations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'profiles'
    AND policyname = 'System can insert profiles'
  ) THEN
    -- Create the policy if it doesn't exist
    CREATE POLICY "System can insert profiles" ON public.profiles
      FOR INSERT
      WITH CHECK (true);
    RAISE NOTICE 'Created "System can insert profiles" policy';
  END IF;
END $$;

-- =============================================================================
-- Fix 5: Recreate event_reminders_status view without SECURITY DEFINER
-- =============================================================================
-- The view was created with SECURITY DEFINER which means it uses the
-- creator's permissions rather than the querying user's permissions.
-- This is a security risk as it bypasses RLS policies on underlying tables.

-- Recreate the view with SECURITY INVOKER (default, but explicit for clarity)
CREATE OR REPLACE VIEW public.event_reminders_status
WITH (security_invoker = true)
AS
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

COMMENT ON VIEW public.event_reminders_status IS
'View showing reminder processing status (with SECURITY INVOKER for proper RLS enforcement):
- pending_count: Reminders not yet sent
- sent_count: Reminders already sent
- due_count: Reminders that should be processed now';

-- =============================================================================
-- Verification
-- =============================================================================
DO $$
DECLARE
  profiles_rls boolean;
  invitation_jobs_rls boolean;
  view_security text;
BEGIN
  -- Check RLS status on profiles
  SELECT relrowsecurity INTO profiles_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'profiles';

  -- Check RLS status on invitation_update_jobs
  SELECT relrowsecurity INTO invitation_jobs_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'invitation_update_jobs';

  RAISE NOTICE '';
  RAISE NOTICE '=== RLS Vulnerability Fixes Applied ===';
  RAISE NOTICE '';
  RAISE NOTICE 'profiles table RLS enabled: %', COALESCE(profiles_rls::text, 'table not found');
  RAISE NOTICE 'invitation_update_jobs table RLS enabled: %', COALESCE(invitation_jobs_rls::text, 'table not found');
  RAISE NOTICE 'event_reminders_status view: recreated with SECURITY INVOKER';
  RAISE NOTICE '';
END $$;
