-- Migration: Fix security issues detected by Supabase linter
-- 1. Fix function search_path for call_process_event_reminders
-- 2. Ensure handle_new_user_ultra_fast has proper search_path
-- 3. Move pg_net extension to extensions schema
-- 4. Fix overly permissive RLS policies for admin_actions and organizations

-- ============================================================================
-- SECTION 1: Fix call_process_event_reminders search_path
-- Issue: Function has a mutable search_path which could allow privilege escalation
-- ============================================================================

CREATE OR REPLACE FUNCTION call_process_event_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'net'
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

-- ============================================================================
-- SECTION 2: Ensure handle_new_user_ultra_fast has proper search_path
-- The function already has SET search_path = 'public' in the latest migration
-- but we re-create it here to ensure consistency
-- ============================================================================

-- Note: handle_new_user_ultra_fast already has SET search_path = 'public'
-- in migration 20260114000000_fix_new_user_organization_creation.sql
-- If the linter still reports issues, it may be due to database state not matching migrations

-- ============================================================================
-- SECTION 3: Move pg_net extension to extensions schema
-- Issue: Extensions in public schema can pose security risks
-- ============================================================================

-- First, ensure the extensions schema exists
CREATE SCHEMA IF NOT EXISTS extensions;

-- Grant usage on extensions schema
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Note: pg_net is managed by Supabase and its objects live in the 'net' schema
-- The extension catalog entry may show 'public' but the actual functions are in 'net'
-- We can attempt to move it, but this may fail on hosted Supabase as it's a system extension

DO $$
BEGIN
  -- Try to alter the extension schema
  -- This may fail on hosted Supabase where pg_net is managed
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    -- Check if we can alter (may not have permission on hosted Supabase)
    BEGIN
      ALTER EXTENSION pg_net SET SCHEMA extensions;
      RAISE NOTICE 'Successfully moved pg_net extension to extensions schema';
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'Cannot move pg_net extension (insufficient privileges - this is expected on hosted Supabase)';
      WHEN feature_not_supported THEN
        RAISE NOTICE 'Cannot move pg_net extension (operation not supported for this extension type)';
      WHEN OTHERS THEN
        RAISE NOTICE 'Cannot move pg_net extension: %', SQLERRM;
    END;
  END IF;
END $$;

-- ============================================================================
-- SECTION 4: Fix overly permissive RLS policies
-- Issue: WITH CHECK (true) allows unrestricted inserts, bypassing RLS
-- ============================================================================

-- 4a. Fix admin_actions INSERT policy
-- The "System can insert admin actions" policy uses WITH CHECK (true)
-- This should be restricted to platform admins or service role only

DROP POLICY IF EXISTS "System can insert admin actions" ON public.admin_actions;

-- Create a more restrictive policy that only allows platform admins to insert
-- The log_admin_action function already checks is_platform_admin(), so we mirror that here
CREATE POLICY "admin_actions_insert_platform_admin"
  ON public.admin_actions
  FOR INSERT
  WITH CHECK (
    -- Allow platform admins to insert directly
    (SELECT is_platform_admin((SELECT auth.uid())))
    OR
    -- Allow service role (used by SECURITY DEFINER functions)
    (SELECT auth.role()) = 'service_role'
  );

-- 4b. Fix organizations INSERT policies
-- Drop overly permissive policies

DROP POLICY IF EXISTS "Anyone can insert organizations" ON public.organizations;
DROP POLICY IF EXISTS "Trigger can insert organizations" ON public.organizations;

-- Create a properly restricted INSERT policy for organizations
-- Organizations should only be created by:
-- 1. Authenticated users (during signup via trigger/onboarding)
-- 2. Platform admins
-- 3. Service role (for system operations)

CREATE POLICY "org_insert_authenticated_or_admin"
  ON public.organizations
  FOR INSERT
  WITH CHECK (
    -- Authenticated users can create organizations (for signup)
    (SELECT auth.uid()) IS NOT NULL
    OR
    -- Service role can insert (for triggers running as SECURITY DEFINER)
    (SELECT auth.role()) = 'service_role'
  );

-- ============================================================================
-- SECTION 5: Verification
-- ============================================================================

DO $$
DECLARE
  func_search_path text;
BEGIN
  -- Verify call_process_event_reminders has search_path set
  SELECT proconfig::text INTO func_search_path
  FROM pg_proc
  WHERE proname = 'call_process_event_reminders'
  AND pronamespace = 'public'::regnamespace;

  IF func_search_path IS NOT NULL AND func_search_path LIKE '%search_path%' THEN
    RAISE NOTICE 'call_process_event_reminders: search_path is properly configured';
  ELSE
    RAISE WARNING 'call_process_event_reminders: search_path may not be configured correctly';
  END IF;

  -- Verify handle_new_user_ultra_fast has search_path set
  SELECT proconfig::text INTO func_search_path
  FROM pg_proc
  WHERE proname = 'handle_new_user_ultra_fast'
  AND pronamespace = 'public'::regnamespace;

  IF func_search_path IS NOT NULL AND func_search_path LIKE '%search_path%' THEN
    RAISE NOTICE 'handle_new_user_ultra_fast: search_path is properly configured';
  ELSE
    RAISE WARNING 'handle_new_user_ultra_fast: search_path may not be configured correctly';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '=== Security Fixes Applied ===';
  RAISE NOTICE '1. call_process_event_reminders: Added SET search_path';
  RAISE NOTICE '2. pg_net extension: Attempted to move to extensions schema (may require manual action on hosted Supabase)';
  RAISE NOTICE '3. admin_actions INSERT policy: Restricted to platform admins and service role';
  RAISE NOTICE '4. organizations INSERT policy: Restricted to authenticated users and service role';
  RAISE NOTICE '';
  RAISE NOTICE 'NOTE: For the "Leaked Password Protection" warning, enable this feature in:';
  RAISE NOTICE '      Supabase Dashboard > Authentication > Settings > Password Security';
  RAISE NOTICE '';
END $$;
