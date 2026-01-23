-- 20260122000001_fix_security_definer_null_checks.sql
-- SECURITY FIX: Add NULL checks to SECURITY DEFINER functions
-- These functions run with elevated privileges and must handle unauthenticated contexts safely

-------------------------------------------------------------------------------
-- Fix get_user_organization_id() to return NULL instead of undefined behavior
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  -- SECURITY: Return NULL if user is not authenticated
  -- This prevents information leakage and ensures RLS policies fail safely
  SELECT CASE
    WHEN auth.uid() IS NULL THEN NULL
    ELSE (
      SELECT organization_id
      FROM public.profiles
      WHERE user_id = auth.uid()
    )
  END;
$$;

-------------------------------------------------------------------------------
-- Fix current_user_is_org_admin() to return FALSE for unauthenticated users
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_is_org_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  -- SECURITY: Return FALSE if user is not authenticated
  -- This ensures admin-only operations fail safely for unauthenticated requests
  SELECT CASE
    WHEN auth.uid() IS NULL THEN FALSE
    ELSE EXISTS(
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'superadmin')
        AND organization_id = get_user_organization_id()
    )
  END;
$$;

-------------------------------------------------------------------------------
-- Fix has_permission() to return FALSE for unauthenticated users
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_permission(p_resource text, p_action text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_role text;
  v_granted boolean;
BEGIN
  -- SECURITY: Get authenticated user ID, return FALSE if not authenticated
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Get user's organization and role
  SELECT organization_id, role INTO v_org_id, v_role
  FROM public.profiles
  WHERE user_id = v_user_id;

  -- If no profile found, deny access
  IF v_org_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Superadmins have all permissions
  IF v_role = 'superadmin' THEN
    RETURN TRUE;
  END IF;

  -- Admins have all permissions within their organization
  IF v_role = 'admin' THEN
    RETURN TRUE;
  END IF;

  -- Check role_permissions table for specific permission
  SELECT granted INTO v_granted
  FROM public.role_permissions
  WHERE role_name = v_role
    AND organization_id = v_org_id
    AND resource = p_resource
    AND action = p_action;

  -- If no explicit permission found, check for 'manage' permission on the resource
  IF v_granted IS NULL THEN
    SELECT granted INTO v_granted
    FROM public.role_permissions
    WHERE role_name = v_role
      AND organization_id = v_org_id
      AND resource = p_resource
      AND action = 'manage';
  END IF;

  -- Default to FALSE (fail-closed) if no permission found
  RETURN COALESCE(v_granted, FALSE);
END;
$$;

-- Add comment explaining security model
COMMENT ON FUNCTION public.get_user_organization_id() IS
  'Returns the organization_id for the current authenticated user. Returns NULL if not authenticated. SECURITY DEFINER - runs with elevated privileges.';

COMMENT ON FUNCTION public.current_user_is_org_admin() IS
  'Returns TRUE if the current user is an admin or superadmin in their organization. Returns FALSE if not authenticated. SECURITY DEFINER - runs with elevated privileges.';

COMMENT ON FUNCTION public.has_permission(text, text) IS
  'Checks if the current user has the specified permission. Returns FALSE if not authenticated or permission not granted. SECURITY DEFINER - runs with elevated privileges.';
