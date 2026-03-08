-- Migration: Fix remaining duplicate permissive policies
-- These policies existed before the previous migration and weren't dropped

-- ============================================================================
-- TABLE: case_types
-- Drop the extra policy that's conflicting with our consolidated policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view case types or superadmins/service can manage all" ON public.case_types;

-- ============================================================================
-- TABLE: user_csrf_sessions
-- The "FOR ALL" service role policy overlaps with user SELECT policy
-- Split service role into specific actions that don't overlap with user SELECT
-- ============================================================================

DROP POLICY IF EXISTS "Service role can manage all CSRF tokens" ON public.user_csrf_sessions;
DROP POLICY IF EXISTS "Users can view their own CSRF tokens" ON public.user_csrf_sessions;

-- Consolidated SELECT: users see their own OR service role sees all
CREATE POLICY "Users and service role can view CSRF tokens"
  ON public.user_csrf_sessions
  FOR SELECT
  USING (
    user_id = (select auth.uid())
    OR (select auth.role()) = 'service_role'
  );

-- Service role only for INSERT/UPDATE/DELETE (users don't need these)
CREATE POLICY "Service role can insert CSRF tokens"
  ON public.user_csrf_sessions
  FOR INSERT
  WITH CHECK ((select auth.role()) = 'service_role');

CREATE POLICY "Service role can update CSRF tokens"
  ON public.user_csrf_sessions
  FOR UPDATE
  USING ((select auth.role()) = 'service_role');

CREATE POLICY "Service role can delete CSRF tokens"
  ON public.user_csrf_sessions
  FOR DELETE
  USING ((select auth.role()) = 'service_role');
