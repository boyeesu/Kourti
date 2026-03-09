-- Migration: Security hardening
-- Fixes:
-- 1. is_platform_admin: ignore p_user_id parameter, always use auth.uid()
-- 2. invitation_update_jobs: restrict RLS to service_role only

-- ============================================================================
-- Fix is_platform_admin to always use auth.uid() (prevents privilege probing)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_role BOOLEAN := false;
  v_uid UUID;
BEGIN
  -- SECURITY: Always use auth.uid() regardless of the p_user_id parameter.
  -- The parameter is kept for backwards compatibility but is intentionally ignored.
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_role_assignments ura
    JOIN public.profiles p ON p.user_id = ura.user_id
    WHERE ura.user_id = v_uid
      AND ura.role_name = 'platform_admin'
      AND p.organization_id IS NOT NULL
  ) INTO v_has_role;

  RETURN COALESCE(v_has_role, false);
END;
$$;

COMMENT ON FUNCTION public.is_platform_admin IS 'Checks if the current authenticated user (auth.uid()) has the platform_admin role. The p_user_id parameter is ignored for security.';

-- ============================================================================
-- Fix invitation_update_jobs RLS: restrict to service_role only
-- ============================================================================

-- Drop the overly permissive policies
DROP POLICY IF EXISTS "invitation_update_jobs_insert" ON public.invitation_update_jobs;
DROP POLICY IF EXISTS "invitation_update_jobs_update" ON public.invitation_update_jobs;
DROP POLICY IF EXISTS "invitation_update_jobs_select" ON public.invitation_update_jobs;
DROP POLICY IF EXISTS "Trigger can insert jobs" ON public.invitation_update_jobs;

-- Ensure RLS is enabled
ALTER TABLE public.invitation_update_jobs ENABLE ROW LEVEL SECURITY;

-- Only service_role can access this table (used by triggers/system functions)
CREATE POLICY "Service role has full access to invitation_update_jobs"
  ON public.invitation_update_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
