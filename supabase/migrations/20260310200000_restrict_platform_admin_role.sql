-- ============================================================================
-- Migration: Restrict platform_admin role assignment
--
-- Platform admin is NOT a global role that organizations can assign.
-- Only existing platform admins (currently daniel@kourti.com) should have it.
-- New platform admins must be created directly in the database.
-- ============================================================================

-- 1. Create a trigger function that prevents platform_admin assignment
--    via normal app operations (INSERT/UPDATE on user_role_assignments)
CREATE OR REPLACE FUNCTION public.prevent_platform_admin_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Block any attempt to assign platform_admin through the app
  -- Platform admin can ONLY be assigned via direct DB access (e.g. psql, Supabase SQL Editor)
  IF NEW.role_name = 'platform_admin' THEN
    -- Check if the operation is coming from a SECURITY DEFINER function context
    -- or direct DB access. If called from RLS context (app user), block it.
    -- We check if current_user is the authenticated role (app requests)
    -- vs postgres/supabase_admin (direct DB access)
    IF current_setting('role', true) = 'authenticated'
       OR current_setting('role', true) = 'anon'
       OR current_setting('request.jwt.claim.role', true) IS NOT NULL THEN
      RAISE EXCEPTION 'platform_admin role cannot be assigned through the application. Contact the platform administrator.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Attach trigger to user_role_assignments table
DROP TRIGGER IF EXISTS check_platform_admin_assignment ON public.user_role_assignments;
CREATE TRIGGER check_platform_admin_assignment
  BEFORE INSERT OR UPDATE ON public.user_role_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_platform_admin_assignment();

-- 3. Also prevent deletion of platform_admin role assignments through the app
CREATE OR REPLACE FUNCTION public.prevent_platform_admin_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role_name = 'platform_admin' THEN
    IF current_setting('role', true) = 'authenticated'
       OR current_setting('role', true) = 'anon'
       OR current_setting('request.jwt.claim.role', true) IS NOT NULL THEN
      RAISE EXCEPTION 'platform_admin role cannot be removed through the application. Contact the platform administrator.';
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS check_platform_admin_removal ON public.user_role_assignments;
CREATE TRIGGER check_platform_admin_removal
  BEFORE DELETE ON public.user_role_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_platform_admin_removal();

-- 4. Patch change_user_role() to block platform_admin assignment
--    This function is SECURITY DEFINER so triggers won't catch it reliably
CREATE OR REPLACE FUNCTION public.change_user_role(
  p_target_user_id uuid,
  p_new_role_name text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_user_roles text[];
  current_org_id uuid;
  target_org_id uuid;
BEGIN
  -- Block platform_admin assignment — can only be set via direct DB access
  IF p_new_role_name = 'platform_admin' THEN
    RETURN json_build_object('error', 'platform_admin role cannot be assigned through the application. Contact the platform administrator.');
  END IF;

  -- Get current user's organization
  SELECT organization_id INTO current_org_id
  FROM public.profiles
  WHERE user_id = auth.uid();

  -- Get current user's roles
  SELECT ARRAY_AGG(role_name) INTO current_user_roles
  FROM public.user_role_assignments
  WHERE user_id = auth.uid() AND organization_id = current_org_id;

  -- Only admins and superadmins can change roles
  IF NOT ('superadmin' = ANY(current_user_roles) OR 'admin' = ANY(current_user_roles)) THEN
    RETURN json_build_object('error', 'Only admins and superadmins can change user roles');
  END IF;

  -- Get target user's organization
  SELECT organization_id INTO target_org_id
  FROM public.profiles
  WHERE user_id = p_target_user_id;

  -- Ensure target user is in same organization
  IF target_org_id != current_org_id THEN
    RETURN json_build_object('error', 'User not found in your organization');
  END IF;

  -- Only superadmins can assign superadmin role
  IF p_new_role_name = 'superadmin' AND NOT ('superadmin' = ANY(current_user_roles)) THEN
    RETURN json_build_object('error', 'Only superadmins can assign the superadmin role');
  END IF;

  -- Validate that the role exists
  IF NOT validate_role_exists(p_new_role_name, current_org_id) THEN
    RETURN json_build_object('error', 'Role does not exist: ' || p_new_role_name);
  END IF;

  -- Delete all existing role assignments for the user
  DELETE FROM public.user_role_assignments
  WHERE user_id = p_target_user_id
    AND organization_id = current_org_id;

  -- Assign the new role
  INSERT INTO public.user_role_assignments (user_id, role_name, organization_id, assigned_by)
  VALUES (p_target_user_id, p_new_role_name, current_org_id, auth.uid());

  RETURN json_build_object(
    'success', true,
    'message', 'User role changed successfully'
  );
END;
$function$;

-- 5. Remove platform_admin from global_roles so it's not discoverable as an assignable role
-- (Keep the is_platform_admin() function intact - it just checks user_role_assignments)
DELETE FROM public.global_roles WHERE role = 'platform_admin';

-- 5. Add a comment for documentation
COMMENT ON FUNCTION public.prevent_platform_admin_assignment() IS
  'Prevents platform_admin role from being assigned through the application.
   New platform admins must be created directly in the database by an authorized DBA.
   Current platform admin: daniel@kourti.com';

COMMENT ON FUNCTION public.prevent_platform_admin_removal() IS
  'Prevents platform_admin role from being removed through the application.';
