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

-- 4. Remove platform_admin from global_roles so it's not discoverable as an assignable role
-- (Keep the is_platform_admin() function intact - it just checks user_role_assignments)
DELETE FROM public.global_roles WHERE role = 'platform_admin';

-- 5. Add a comment for documentation
COMMENT ON FUNCTION public.prevent_platform_admin_assignment() IS
  'Prevents platform_admin role from being assigned through the application.
   New platform admins must be created directly in the database by an authorized DBA.
   Current platform admin: daniel@kourti.com';

COMMENT ON FUNCTION public.prevent_platform_admin_removal() IS
  'Prevents platform_admin role from being removed through the application.';
