-- ============================================================================
-- DATABASE ROLLBACK SCRIPT
-- Rollback changes from commit 1727daa (calendar sync implementation)
-- Target: Roll back to state at commit 5b5219ae90fd2051693f79a328d6bf2e4fdcf85a
-- ============================================================================
-- 
-- WARNING: This script will remove:
-- 1. Calendar sync tables and RLS policies
-- 2. Permission function fixes
-- 3. Permission validation constraints
-- 4. RLS policy updates related to role assignments
--
-- Run this script in your Supabase SQL Editor or via psql
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- PART 1: Remove Calendar Sync Tables and Related Objects
-- ============================================================================

-- Drop calendar_sync_logs table (added in 20250117000000)
DROP TABLE IF EXISTS public.calendar_sync_logs CASCADE;

-- Remove sync-related columns from user_calendar_integrations (if they exist)
DO $$ 
BEGIN
  -- Remove sync settings columns if they exist
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_calendar_integrations' AND column_name = 'sync_settings') THEN
    ALTER TABLE public.user_calendar_integrations DROP COLUMN sync_settings;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_calendar_integrations' AND column_name = 'last_sync_at') THEN
    ALTER TABLE public.user_calendar_integrations DROP COLUMN last_sync_at;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_calendar_integrations' AND column_name = 'sync_direction') THEN
    ALTER TABLE public.user_calendar_integrations DROP COLUMN sync_direction;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_calendar_integrations' AND column_name = 'sync_enabled') THEN
    ALTER TABLE public.user_calendar_integrations DROP COLUMN sync_enabled;
  END IF;
END $$;

-- Drop RLS policies for calendar sync (added in 20250117000000)
-- Note: calendar_sync_logs policies are automatically dropped with CASCADE above
DO $$ 
BEGIN
  -- Only drop policies if the table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_calendar_integrations') THEN
    DROP POLICY IF EXISTS "Users can delete their own calendar integrations" ON public.user_calendar_integrations;
    DROP POLICY IF EXISTS "Users can update their own calendar integrations" ON public.user_calendar_integrations;
    DROP POLICY IF EXISTS "Users can insert their own calendar integrations" ON public.user_calendar_integrations;
    DROP POLICY IF EXISTS "Users can view their own calendar integrations" ON public.user_calendar_integrations;
  END IF;
END $$;

-- ============================================================================
-- PART 2: Remove Permission Function and Dependent Policies
-- ============================================================================
-- The has_permission() function is used by RLS policies. We need to:
-- 1. Find and drop all policies that use has_permission()
-- 2. Restore original organization-based policies
-- 3. Then drop the function

-- Step 1: Drop policies on cases table that use has_permission()
DROP POLICY IF EXISTS "Users can view cases with read permission" ON public.cases;
DROP POLICY IF EXISTS "Users can create cases with create permission" ON public.cases;
DROP POLICY IF EXISTS "Users can update cases with update permission" ON public.cases;
DROP POLICY IF EXISTS "Users can delete cases with delete permission" ON public.cases;

-- Step 2: Restore original organization-based policies for cases (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cases') THEN
    -- Only create if they don't already exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' 
      AND tablename = 'cases' 
      AND policyname = 'Users can view cases in their organization'
    ) THEN
      CREATE POLICY "Users can view cases in their organization"
      ON public.cases
      FOR SELECT
      TO authenticated
      USING (organization_id = get_current_user_organization_id());
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' 
      AND tablename = 'cases' 
      AND policyname = 'Users can create cases in their organization'
    ) THEN
      CREATE POLICY "Users can create cases in their organization"
      ON public.cases
      FOR INSERT
      TO authenticated
      WITH CHECK (organization_id = get_current_user_organization_id());
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' 
      AND tablename = 'cases' 
      AND policyname = 'Users can update cases in their organization'
    ) THEN
      CREATE POLICY "Users can update cases in their organization"
      ON public.cases
      FOR UPDATE
      TO authenticated
      USING (organization_id = get_current_user_organization_id());
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' 
      AND tablename = 'cases' 
      AND policyname = 'Users can delete cases in their organization'
    ) THEN
      CREATE POLICY "Users can delete cases in their organization"
      ON public.cases
      FOR DELETE
      TO authenticated
      USING (organization_id = get_current_user_organization_id());
    END IF;
  END IF;
END $$;

-- Step 3: Find and drop policies on other tables that might use has_permission()
-- Query pg_policies view using qual and with_check columns which contain the policy expressions
DO $$
DECLARE
  policy_record RECORD;
BEGIN
  -- Find all policies that reference has_permission function
  -- pg_policies view has 'qual' (USING clause) and 'with_check' (WITH CHECK clause) columns
  FOR policy_record IN
    SELECT 
      schemaname,
      tablename,
      policyname
    FROM pg_policies
    WHERE schemaname = 'public'
    AND (
      (qual IS NOT NULL AND (qual::text LIKE '%has_permission(%' OR qual::text LIKE '%has_permission (%'))
      OR (with_check IS NOT NULL AND (with_check::text LIKE '%has_permission(%' OR with_check::text LIKE '%has_permission (%'))
    )
  LOOP
    -- Drop the policy
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 
        policy_record.policyname, 
        policy_record.schemaname, 
        policy_record.tablename);
      
      RAISE NOTICE 'Dropped policy % on table %', policy_record.policyname, policy_record.tablename;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not drop policy % on table %: %', 
        policy_record.policyname, policy_record.tablename, SQLERRM;
    END;
  END LOOP;
END $$;

-- Step 4: Now drop the has_permission wrapper function
DROP FUNCTION IF EXISTS public.has_permission(TEXT, TEXT) CASCADE;

-- ============================================================================
-- PART 3: Rollback Permission Logic Changes
-- ============================================================================
-- Note: The exact changes in 20250115000001, 20250115000002, and 20250115000003
-- may have modified existing functions and policies. Since we don't have the
-- exact before state, you may need to manually review and restore:
--
-- - user_has_permission function (if it was modified)
-- - RLS policies that were updated to use role_assignments
-- - Permission validation constraints
--
-- Check your git history or backup to see what these migrations changed.

-- ============================================================================
-- PART 4: Rollback New User Permission Assignment (20250116000000)
-- ============================================================================
-- This migration likely modified triggers or functions related to new user
-- permission assignment. You may need to manually restore the previous version
-- of any modified functions or triggers.

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Check and report status (non-blocking)
DO $$
BEGIN
  -- Check calendar_sync_logs table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'calendar_sync_logs') THEN
    RAISE WARNING 'calendar_sync_logs table still exists - may need manual removal';
  ELSE
    RAISE NOTICE 'calendar_sync_logs table does not exist (OK)';
  END IF;
  
  -- Check has_permission function
  IF EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'has_permission') THEN
    RAISE WARNING 'has_permission function still exists - may need manual removal';
  ELSE
    RAISE NOTICE 'has_permission function does not exist (OK)';
  END IF;
  
  RAISE NOTICE 'Rollback script completed.';
  RAISE NOTICE 'If tables/functions did not exist, this is normal if migrations were not applied.';
  RAISE NOTICE 'Please verify your application still works correctly.';
END $$;

