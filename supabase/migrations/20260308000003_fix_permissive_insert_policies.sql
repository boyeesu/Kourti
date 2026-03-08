-- ============================================================================
-- Migration: Fix Overly Permissive RLS INSERT Policies
-- Date: 2026-01-11
-- Issue: "System can insert" policies use WITH CHECK (true) which is flagged
--        by the Supabase linter as overly permissive
-- Fix: Restrict INSERT to service_role only (used by triggers/edge functions)
-- ============================================================================

-- ============================================================================
-- TABLE: profiles
-- The "System can insert profiles" policy should only allow service_role
-- Profile inserts happen via auth triggers, not direct user inserts
-- ============================================================================

DROP POLICY IF EXISTS "System can insert profiles" ON public.profiles;

-- Only service_role can insert profiles (used by auth trigger on user creation)
CREATE POLICY "Service role can insert profiles"
  ON public.profiles
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ============================================================================
-- TABLE: audit_logs
-- The "System can insert audit logs" policy should only allow service_role
-- Audit logs are inserted by system functions, not direct user inserts
-- ============================================================================

DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;

-- Only service_role can insert audit logs (used by audit logging functions)
CREATE POLICY "Service role can insert audit logs"
  ON public.audit_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ============================================================================
-- NOTE: Leaked Password Protection
-- This is configured via Supabase Dashboard > Auth > Providers > Email
-- Enable "Prevent use of leaked passwords" setting
-- Cannot be fixed via SQL migration
-- ============================================================================
