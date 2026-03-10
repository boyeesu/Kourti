-- ============================================================================
-- Migration: Fix RBAC Permission Source of Truth
-- Date: 2026-03-11
-- Description: CRITICAL FIX - Align all permission checks with user_role_assignments
--              table instead of legacy profiles.role column.
--
-- Problem: has_permission() and RLS policies read from profiles.role (enum:
--          superadmin/admin/user) which is never updated when roles are assigned
--          via user_role_assignments. Custom role permissions are completely ignored.
--
-- Fix: Rewrite has_permission(), current_user_is_org_admin(), is_user_admin(),
--      and all RLS policies to use user_role_assignments as the source of truth,
--      with fallback to profiles.role for backward compatibility.
-- ============================================================================


-- ============================================================================
-- SECTION 1: Rewrite has_permission(p_resource text, p_action text)
--
-- The previous version (from 20260310100000_security_audit_fixes.sql) reads
-- profiles.role and ignores user_role_assignments entirely. Custom role
-- permissions configured via the UI are completely ignored.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_permission(p_resource text, p_action text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_roles text[];
  v_granted boolean;
  v_role text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN FALSE; END IF;

  -- Get user's organization
  SELECT organization_id INTO v_org_id
  FROM public.profiles WHERE user_id = v_user_id;
  IF v_org_id IS NULL THEN RETURN FALSE; END IF;

  -- Source of truth: user_role_assignments
  SELECT ARRAY_AGG(role_name) INTO v_roles
  FROM public.user_role_assignments
  WHERE user_id = v_user_id AND organization_id = v_org_id;

  -- Backward compat: fall back to profiles.role if no assignments exist
  IF v_roles IS NULL OR array_length(v_roles, 1) = 0 THEN
    SELECT role::text INTO v_role FROM public.profiles WHERE user_id = v_user_id;
    IF v_role IS NOT NULL THEN v_roles := ARRAY[v_role]; END IF;
  END IF;

  IF v_roles IS NULL THEN RETURN FALSE; END IF;

  -- Superadmin: all permissions always
  IF 'superadmin' = ANY(v_roles) THEN RETURN TRUE; END IF;

  -- Check explicit permissions FIRST (allows overriding defaults)
  FOREACH v_role IN ARRAY v_roles LOOP
    SELECT granted INTO v_granted
    FROM public.role_permissions
    WHERE role_name = v_role
      AND organization_id = v_org_id
      AND resource = p_resource
      AND action = p_action;
    IF v_granted IS NOT NULL THEN RETURN v_granted; END IF;

    -- Check 'manage' fallback
    SELECT granted INTO v_granted
    FROM public.role_permissions
    WHERE role_name = v_role
      AND organization_id = v_org_id
      AND resource = p_resource
      AND action = 'manage';
    IF v_granted IS NOT NULL THEN RETURN v_granted; END IF;
  END LOOP;

  -- No explicit permission found — apply role defaults
  IF 'admin' = ANY(v_roles) THEN RETURN TRUE; END IF;
  IF 'user' = ANY(v_roles) THEN
    RETURN p_action IN ('create', 'read', 'update');
  END IF;

  -- Custom role with no explicit permissions: deny
  RETURN FALSE;
END;
$$;


-- ============================================================================
-- SECTION 2: Rewrite current_user_is_org_admin()
--
-- The previous version checks profiles.role which is the legacy column.
-- This version uses user_role_assignments as the source of truth.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_user_is_org_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN FALSE
    ELSE EXISTS(
      SELECT 1 FROM public.user_role_assignments
      WHERE user_id = auth.uid()
        AND role_name IN ('admin', 'superadmin')
        AND organization_id = public.get_user_organization_id()
    )
  END;
$$;


-- ============================================================================
-- SECTION 3: Create/rewrite is_user_admin()
--
-- Helper function used by various RLS policies. Must use
-- user_role_assignments instead of profiles.role.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_user_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN FALSE
    ELSE EXISTS(
      SELECT 1 FROM public.user_role_assignments
      WHERE user_id = auth.uid()
        AND role_name IN ('admin', 'superadmin')
        AND organization_id = public.get_user_organization_id()
    )
  END;
$$;


-- ============================================================================
-- SECTION 4: Fix RLS policies on role_permissions table
--
-- The current policy checks profiles.role = 'superadmin'::user_role.
-- Replace with user_role_assignments check.
-- ============================================================================

DROP POLICY IF EXISTS "Superadmins can manage role permissions" ON public.role_permissions;
CREATE POLICY "Superadmins can manage role permissions"
ON public.role_permissions
FOR ALL
USING (
  organization_id = public.get_user_organization_id()
  AND EXISTS (
    SELECT 1 FROM public.user_role_assignments
    WHERE user_id = auth.uid()
      AND role_name IN ('admin', 'superadmin')
      AND organization_id = public.get_user_organization_id()
  )
);


-- ============================================================================
-- SECTION 5: Fix webhook_endpoints RLS policies
--
-- The current policies (from 20260310100000_security_audit_fixes.sql) check
-- profiles.role via p.role IN ('admin', 'superadmin'). Replace with
-- user_role_assignments checks.
-- ============================================================================

DROP POLICY IF EXISTS webhook_endpoints_admin_select ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_admin_select ON public.webhook_endpoints
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_role_assignments ura
      WHERE ura.user_id = auth.uid()
        AND ura.role_name IN ('admin', 'superadmin')
        AND (webhook_endpoints.organization_id IS NULL OR ura.organization_id = webhook_endpoints.organization_id)
    )
  );

DROP POLICY IF EXISTS webhook_endpoints_admin_insert ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_admin_insert ON public.webhook_endpoints
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_role_assignments ura
      WHERE ura.user_id = auth.uid()
        AND ura.role_name IN ('admin', 'superadmin')
        AND ura.organization_id = webhook_endpoints.organization_id
    )
  );

DROP POLICY IF EXISTS webhook_endpoints_admin_update ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_admin_update ON public.webhook_endpoints
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_role_assignments ura
      WHERE ura.user_id = auth.uid()
        AND ura.role_name IN ('admin', 'superadmin')
        AND ura.organization_id = webhook_endpoints.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_role_assignments ura
      WHERE ura.user_id = auth.uid()
        AND ura.role_name IN ('admin', 'superadmin')
        AND ura.organization_id = webhook_endpoints.organization_id
    )
  );

DROP POLICY IF EXISTS webhook_endpoints_admin_delete ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_admin_delete ON public.webhook_endpoints
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_role_assignments ura
      WHERE ura.user_id = auth.uid()
        AND ura.role_name IN ('admin', 'superadmin')
        AND ura.organization_id = webhook_endpoints.organization_id
    )
  );


-- ============================================================================
-- SECTION 6: Fix reminder_templates delete policy
--
-- The current policy (from 20260310100000_security_audit_fixes.sql) checks
-- profiles.role IN ('admin', 'superadmin'). Replace with user_role_assignments.
-- ============================================================================

DROP POLICY IF EXISTS "reminder_templates_delete" ON public.reminder_templates;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'reminder_templates') THEN
    CREATE POLICY "reminder_templates_delete" ON public.reminder_templates
      FOR DELETE TO authenticated
      USING (
        organization_id IN (
          SELECT ura.organization_id FROM public.user_role_assignments ura
          WHERE ura.user_id = auth.uid()
            AND ura.role_name IN ('admin', 'superadmin')
        )
      );
  END IF;
END $$;


-- ============================================================================
-- SECTION 7: Drop stale individual role_permissions policies
--
-- Migration 20251205 created separate INSERT/UPDATE/DELETE policies that
-- still reference profiles.role = 'superadmin'. The FOR ALL policy above
-- supersedes them. Drop to avoid confusion and stale legacy paths.
-- ============================================================================

DROP POLICY IF EXISTS "Superadmins can create role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Superadmins can update role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Superadmins can delete role permissions" ON public.role_permissions;


-- ============================================================================
-- SECTION 8: Fix audit_logs RLS policy
--
-- From migration 20251205: checks profiles.role = 'superadmin'::user_role
-- ============================================================================

DROP POLICY IF EXISTS "Superadmins can view audit logs in their organization" ON public.audit_logs;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_logs') THEN
    CREATE POLICY "Superadmins can view audit logs in their organization" ON public.audit_logs
      FOR SELECT USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
          SELECT 1 FROM public.user_role_assignments ura
          WHERE ura.user_id = (SELECT auth.uid())
            AND ura.role_name IN ('admin', 'superadmin')
            AND ura.organization_id = public.get_user_organization_id()
        )
      );
  END IF;
END $$;


-- ============================================================================
-- SECTION 9: Fix security_audit_logs RLS policies
--
-- From migration 20260307000008: checks p.role IN ('admin', 'superadmin')
-- ============================================================================

DROP POLICY IF EXISTS security_audit_logs_admin_select ON public.security_audit_logs;
CREATE POLICY security_audit_logs_admin_select ON public.security_audit_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_role_assignments ura
      WHERE ura.user_id = auth.uid()
        AND ura.role_name IN ('admin', 'superadmin')
    )
  );

DROP POLICY IF EXISTS security_audit_logs_admin_insert ON public.security_audit_logs;
CREATE POLICY security_audit_logs_admin_insert ON public.security_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_role_assignments ura
      WHERE ura.user_id = auth.uid()
        AND ura.role_name IN ('admin', 'superadmin')
    )
  );


-- ============================================================================
-- SECTION 10: Fix api_keys RLS policies
--
-- From migration 20260307000007: checks p.role IN ('admin', 'superadmin')
-- ============================================================================

DROP POLICY IF EXISTS api_keys_admin_select ON public.api_keys;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'api_keys') THEN
    CREATE POLICY api_keys_admin_select ON public.api_keys
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_role_assignments ura
          WHERE ura.user_id = auth.uid()
            AND ura.role_name IN ('admin', 'superadmin')
        )
      );
  END IF;
END $$;

DROP POLICY IF EXISTS api_keys_admin_modify ON public.api_keys;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'api_keys') THEN
    CREATE POLICY api_keys_admin_modify ON public.api_keys
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_role_assignments ura
          WHERE ura.user_id = auth.uid()
            AND ura.role_name IN ('admin', 'superadmin')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_role_assignments ura
          WHERE ura.user_id = auth.uid()
            AND ura.role_name IN ('admin', 'superadmin')
        )
      );
  END IF;
END $$;


-- ============================================================================
-- SECTION 11: Fix api_rate_limit_windows RLS policy
--
-- From migration 20260307000007: checks p.role IN ('admin', 'superadmin')
-- ============================================================================

DROP POLICY IF EXISTS api_rate_limit_windows_admin_only ON public.api_rate_limit_windows;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'api_rate_limit_windows') THEN
    CREATE POLICY api_rate_limit_windows_admin_only ON public.api_rate_limit_windows
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_role_assignments ura
          WHERE ura.user_id = auth.uid()
            AND ura.role_name IN ('admin', 'superadmin')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_role_assignments ura
          WHERE ura.user_id = auth.uid()
            AND ura.role_name IN ('admin', 'superadmin')
        )
      );
  END IF;
END $$;


-- ============================================================================
-- SECTION 12: Fix api_request_logs RLS policies
--
-- From migration 20260307000007: checks p.role IN ('admin', 'superadmin')
-- ============================================================================

DROP POLICY IF EXISTS api_request_logs_admin_select ON public.api_request_logs;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'api_request_logs') THEN
    CREATE POLICY api_request_logs_admin_select ON public.api_request_logs
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_role_assignments ura
          WHERE ura.user_id = auth.uid()
            AND ura.role_name IN ('admin', 'superadmin')
        )
      );
  END IF;
END $$;

DROP POLICY IF EXISTS api_request_logs_admin_insert ON public.api_request_logs;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'api_request_logs') THEN
    CREATE POLICY api_request_logs_admin_insert ON public.api_request_logs
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_role_assignments ura
          WHERE ura.user_id = auth.uid()
            AND ura.role_name IN ('admin', 'superadmin')
        )
      );
  END IF;
END $$;

DROP POLICY IF EXISTS api_request_logs_admin_update ON public.api_request_logs;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'api_request_logs') THEN
    CREATE POLICY api_request_logs_admin_update ON public.api_request_logs
      FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_role_assignments ura
          WHERE ura.user_id = auth.uid()
            AND ura.role_name IN ('admin', 'superadmin')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_role_assignments ura
          WHERE ura.user_id = auth.uid()
            AND ura.role_name IN ('admin', 'superadmin')
        )
      );
  END IF;
END $$;


-- ============================================================================
-- SECTION 13: Fix api_calendar_events RLS policy
--
-- From migration 20260307000007: checks p.role IN ('admin', 'superadmin')
-- ============================================================================

DROP POLICY IF EXISTS api_calendar_events_admin_select ON public.api_calendar_events;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'api_calendar_events') THEN
    CREATE POLICY api_calendar_events_admin_select ON public.api_calendar_events
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_role_assignments ura
          WHERE ura.user_id = auth.uid()
            AND ura.role_name IN ('admin', 'superadmin')
        )
      );
  END IF;
END $$;


-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== RBAC Permission Source Fix Applied ===';
  RAISE NOTICE '';
  RAISE NOTICE 'Functions fixed (3):';
  RAISE NOTICE '  1. has_permission() — reads user_role_assignments, explicit perms first (CRITICAL)';
  RAISE NOTICE '  2. current_user_is_org_admin() — reads user_role_assignments (CRITICAL)';
  RAISE NOTICE '  3. is_user_admin() — reads user_role_assignments (HIGH)';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS policies fixed (16):';
  RAISE NOTICE '  4. role_permissions — FOR ALL + dropped 3 stale individual policies';
  RAISE NOTICE '  5. webhook_endpoints — SELECT, INSERT, UPDATE, DELETE';
  RAISE NOTICE '  6. reminder_templates — DELETE';
  RAISE NOTICE '  7. audit_logs — SELECT';
  RAISE NOTICE '  8. security_audit_logs — SELECT, INSERT';
  RAISE NOTICE '  9. api_keys — SELECT, ALL';
  RAISE NOTICE '  10. api_rate_limit_windows — ALL';
  RAISE NOTICE '  11. api_request_logs — SELECT, INSERT, UPDATE';
  RAISE NOTICE '  12. api_calendar_events — SELECT';
  RAISE NOTICE '';
  RAISE NOTICE 'All admin checks now use user_role_assignments as source of truth.';
  RAISE NOTICE 'Explicit role_permissions entries take priority over built-in defaults.';
  RAISE NOTICE 'Superadmin retains implicit full access.';
  RAISE NOTICE '';
END $$;
