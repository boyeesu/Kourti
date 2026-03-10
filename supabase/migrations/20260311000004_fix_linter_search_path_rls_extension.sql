-- Migration: Fix remaining Supabase linter warnings
-- Date: 2026-03-11
--
-- 1. function_search_path_mutable (24 functions) — SET search_path via ALTER FUNCTION
-- 2. extension_in_public (pg_net) — attempt to move out of public schema
-- 3. rls_policy_always_true (7 policies) — drop lingering overly permissive policies
-- 4. auth_leaked_password_protection — dashboard setting (noted in comments)

-- =============================================================================
-- SECTION 1: Fix function search_path (24 functions)
-- ALTER FUNCTION ... SET search_path is idempotent — safe to re-apply.
-- =============================================================================

-- 1a. SECURITY DEFINER functions (schema poisoning risk)

ALTER FUNCTION public.generate_advanced_recurring_instances(uuid, date, date)
  SET search_path = public;

ALTER FUNCTION public.generate_recurring_instances(uuid, date, date)
  SET search_path = public;

ALTER FUNCTION public.get_user_conversations_optimized()
  SET search_path = public;

ALTER FUNCTION public.get_calendar_viewers(uuid)
  SET search_path = public;

ALTER FUNCTION public.get_shared_calendars(uuid)
  SET search_path = public;

ALTER FUNCTION public.get_calendar_events_with_instances(uuid, timestamptz, timestamptz, uuid)
  SET search_path = public;

ALTER FUNCTION public.user_can_view_calendar_event(uuid, uuid)
  SET search_path = public;

ALTER FUNCTION public.user_can_edit_calendar_event(uuid, uuid)
  SET search_path = public;

ALTER FUNCTION public.delete_event_instance(uuid)
  SET search_path = public;

ALTER FUNCTION public.modify_event_instance(uuid, timestamptz, timestamptz, text, text, text)
  SET search_path = public;

ALTER FUNCTION public.respond_to_invitation(uuid, text, uuid)
  SET search_path = public;

ALTER FUNCTION public.get_user_organization_id()
  SET search_path = public;

ALTER FUNCTION public.get_users_for_digest(text, time)
  SET search_path = public;

ALTER FUNCTION public.get_upcoming_events_for_digest(uuid, uuid, date, date)
  SET search_path = public;

ALTER FUNCTION public.expire_user_plans()
  SET search_path = public;

-- call_process_event_reminders needs 'net' schema for net.http_post
ALTER FUNCTION public.call_process_event_reminders()
  SET search_path = 'public', 'net';

-- 1b. Trigger / non-SECURITY DEFINER functions (lower risk but still flagged)

ALTER FUNCTION public.update_user_plan_updated_at()
  SET search_path = public;

ALTER FUNCTION public.update_calendar_event_instances_updated_at()
  SET search_path = public;

ALTER FUNCTION public.update_calendar_shares_updated_at()
  SET search_path = public;

ALTER FUNCTION public.update_event_invitations_updated_at()
  SET search_path = public;

ALTER FUNCTION public.update_subscription_updated_at()
  SET search_path = public;

ALTER FUNCTION public.auto_generate_event_instances()
  SET search_path = public;

ALTER FUNCTION public.create_reminder_queue_entries()
  SET search_path = public;

ALTER FUNCTION public.notify_calendar_shared()
  SET search_path = public;


-- =============================================================================
-- SECTION 2: Move pg_net extension out of public schema
-- On hosted Supabase this will likely fail silently — pg_net is managed and
-- its functions already live in the 'net' schema. The extension catalog entry
-- showing 'public' is a known Supabase limitation that can be safely ignored.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension
    WHERE extname = 'pg_net'
    AND extnamespace = 'public'::regnamespace
  ) THEN
    BEGIN
      ALTER EXTENSION pg_net SET SCHEMA extensions;
      RAISE NOTICE 'Moved pg_net to extensions schema';
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'Cannot move pg_net (managed by Supabase) — safe to ignore on hosted Supabase';
      WHEN OTHERS THEN
        RAISE NOTICE 'Cannot move pg_net: % — safe to ignore on hosted Supabase', SQLERRM;
    END;
  END IF;
END $$;


-- =============================================================================
-- SECTION 3: Drop lingering overly permissive RLS policies
-- Earlier migrations (20260115000000, 20260309200000) should have dropped these,
-- but the linter still reports them. DROP POLICY IF EXISTS is idempotent.
-- =============================================================================

-- admin_actions: WITH CHECK (true) for INSERT
DROP POLICY IF EXISTS "System can insert admin actions" ON public.admin_actions;

-- invitation_update_jobs: USING (true) + WITH CHECK (true)
DROP POLICY IF EXISTS "Service role can update jobs" ON public.invitation_update_jobs;
DROP POLICY IF EXISTS "Trigger can insert jobs" ON public.invitation_update_jobs;

-- organizations: WITH CHECK (true) for INSERT
DROP POLICY IF EXISTS "Anyone can insert organizations" ON public.organizations;
DROP POLICY IF EXISTS "Trigger can insert organizations" ON public.organizations;

-- profiles: WITH CHECK (true) for INSERT
DROP POLICY IF EXISTS "Trigger can insert profiles" ON public.profiles;


-- =============================================================================
-- SECTION 4: Auth leaked password protection
-- This is a Supabase Dashboard setting, NOT fixable via SQL migration.
-- Enable it at: Authentication > Settings > Password Security
-- =============================================================================

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
  v_unfixed integer;
BEGIN
  SELECT COUNT(*) INTO v_unfixed
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'generate_advanced_recurring_instances', 'generate_recurring_instances',
      'get_user_conversations_optimized', 'get_calendar_viewers',
      'get_shared_calendars', 'get_calendar_events_with_instances',
      'user_can_view_calendar_event', 'user_can_edit_calendar_event',
      'delete_event_instance', 'modify_event_instance',
      'respond_to_invitation', 'get_user_organization_id',
      'get_users_for_digest', 'get_upcoming_events_for_digest',
      'expire_user_plans', 'call_process_event_reminders',
      'update_user_plan_updated_at', 'update_calendar_event_instances_updated_at',
      'update_calendar_shares_updated_at', 'update_event_invitations_updated_at',
      'update_subscription_updated_at', 'auto_generate_event_instances',
      'create_reminder_queue_entries', 'notify_calendar_shared'
    )
    AND (p.proconfig IS NULL OR NOT p.proconfig::text LIKE '%search_path%');

  RAISE NOTICE 'Functions still missing search_path: % (should be 0)', v_unfixed;
  RAISE NOTICE '';
  RAISE NOTICE '=== Linter Fixes Applied ===';
  RAISE NOTICE '  24 functions: SET search_path';
  RAISE NOTICE '  pg_net: move attempted (may fail on hosted Supabase)';
  RAISE NOTICE '  6 overly permissive RLS policies: dropped';
  RAISE NOTICE '';
  RAISE NOTICE 'MANUAL ACTION REQUIRED:';
  RAISE NOTICE '  Enable "Leaked Password Protection" in Supabase Dashboard:';
  RAISE NOTICE '  Authentication > Settings > Password Security';
END $$;
