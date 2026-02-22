-- ============================================================================
-- PHASE 4: Normalize Permission System
-- ============================================================================

-- Create validation function to check if a role exists in either global or custom roles
CREATE OR REPLACE FUNCTION public.validate_role_exists(p_role_name TEXT, p_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if role exists in global_roles
  IF EXISTS (SELECT 1 FROM public.global_roles WHERE role = p_role_name) THEN
    RETURN TRUE;
  END IF;
  
  -- Check if role exists in user_roles for the organization
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE role_name = p_role_name 
    AND organization_id = p_organization_id
  ) THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;

-- Create validation function for role_permissions
CREATE OR REPLACE FUNCTION public.validate_role_permission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate that the role exists
  IF NOT public.validate_role_exists(NEW.role_name, NEW.organization_id) THEN
    RAISE EXCEPTION 'Role "%" does not exist for organization "%"', NEW.role_name, NEW.organization_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create validation function for user_role_assignments
CREATE OR REPLACE FUNCTION public.validate_user_role_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate that the role exists
  IF NOT public.validate_role_exists(NEW.role_name, NEW.organization_id) THEN
    RAISE EXCEPTION 'Cannot assign role "%" - it does not exist for organization "%"', NEW.role_name, NEW.organization_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_validate_role_permission ON public.role_permissions;
DROP TRIGGER IF EXISTS trigger_validate_user_role_assignment ON public.user_role_assignments;

-- Create trigger for role_permissions validation
CREATE TRIGGER trigger_validate_role_permission
  BEFORE INSERT OR UPDATE ON public.role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_role_permission();

-- Create trigger for user_role_assignments validation
CREATE TRIGGER trigger_validate_user_role_assignment
  BEFORE INSERT OR UPDATE ON public.user_role_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_user_role_assignment();

-- Create a consolidated view of all roles (global + custom) for easy querying
CREATE OR REPLACE VIEW public.all_roles AS
SELECT 
  role as role_name,
  display_name,
  description,
  NULL::UUID as organization_id,
  'global' as role_type,
  role as role_id
FROM public.global_roles

UNION ALL

SELECT 
  role_name,
  role_name as display_name,
  description,
  organization_id,
  'custom' as role_type,
  id::TEXT as role_id
FROM public.user_roles;

-- Add indexes for better performance on role lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_role_name_org ON public.user_roles(role_name, organization_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_name_org ON public.role_permissions(role_name, organization_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_role_org ON public.user_role_assignments(role_name, organization_id);
CREATE INDEX IF NOT EXISTS idx_global_roles_role ON public.global_roles(role);

-- Create a function to get all roles for a specific organization (including global)
CREATE OR REPLACE FUNCTION public.get_organization_roles(p_organization_id UUID)
RETURNS TABLE(
  role_name TEXT,
  display_name TEXT,
  description TEXT,
  role_type TEXT,
  organization_id UUID
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- Get global roles
  SELECT 
    role::TEXT as role_name,
    display_name,
    description,
    'global'::TEXT as role_type,
    NULL::UUID as organization_id
  FROM public.global_roles
  
  UNION ALL
  
  -- Get custom roles for the organization
  SELECT 
    role_name,
    role_name as display_name,
    description,
    'custom'::TEXT as role_type,
    organization_id
  FROM public.user_roles
  WHERE organization_id = p_organization_id
  
  ORDER BY role_type, role_name;
$$;

-- Add a function to safely delete roles (prevents deletion if in use)
CREATE OR REPLACE FUNCTION public.safe_delete_custom_role(p_role_name TEXT, p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment_count INTEGER;
  v_permission_count INTEGER;
BEGIN
  -- Check if role is assigned to any users
  SELECT COUNT(*) INTO v_assignment_count
  FROM public.user_role_assignments
  WHERE role_name = p_role_name 
  AND organization_id = p_organization_id;
  
  IF v_assignment_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Cannot delete role "%s" - it is assigned to %s user(s)', p_role_name, v_assignment_count)
    );
  END IF;
  
  -- Check if role has permissions defined
  SELECT COUNT(*) INTO v_permission_count
  FROM public.role_permissions
  WHERE role_name = p_role_name 
  AND organization_id = p_organization_id;
  
  -- Delete permissions first
  IF v_permission_count > 0 THEN
    DELETE FROM public.role_permissions
    WHERE role_name = p_role_name 
    AND organization_id = p_organization_id;
  END IF;
  
  -- Delete the role
  DELETE FROM public.user_roles
  WHERE role_name = p_role_name 
  AND organization_id = p_organization_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', format('Role "%s" deleted successfully', p_role_name)
  );
END;
$$;

-- Create a function to check if a user has a specific permission
CREATE OR REPLACE FUNCTION public.user_has_specific_permission(
  p_user_id UUID,
  p_resource TEXT,
  p_action TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_has_permission BOOLEAN := false;
  v_user_role_names TEXT[];
BEGIN
  -- Get user's organization
  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE user_id = p_user_id;
  
  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Get all role names for the user
  SELECT ARRAY_AGG(role_name) INTO v_user_role_names
  FROM public.user_role_assignments
  WHERE user_id = p_user_id 
  AND organization_id = v_org_id;
  
  IF v_user_role_names IS NULL OR array_length(v_user_role_names, 1) = 0 THEN
    RETURN false;
  END IF;
  
  -- Superadmins have all permissions
  IF 'superadmin' = ANY(v_user_role_names) THEN
    RETURN true;
  END IF;
  
  -- Check explicit permissions
  SELECT EXISTS (
    SELECT 1
    FROM public.role_permissions
    WHERE role_name = ANY(v_user_role_names)
    AND organization_id = v_org_id
    AND resource = p_resource
    AND action = p_action
    AND granted = true
  ) INTO v_has_permission;
  
  -- If no explicit permission found, check default permissions for global roles
  IF NOT v_has_permission THEN
    -- Admins get CRUD by default
    IF 'admin' = ANY(v_user_role_names) AND p_action IN ('create', 'read', 'update', 'delete', 'manage') THEN
      v_has_permission := true;
    -- Users get CRU by default
    ELSIF 'user' = ANY(v_user_role_names) AND p_action IN ('create', 'read', 'update') THEN
      v_has_permission := true;
    END IF;
  END IF;
  
  RETURN v_has_permission;
END;
$$;

-- Add comments for documentation
COMMENT ON FUNCTION public.validate_role_exists IS 'Validates if a role exists in either global_roles or user_roles for the given organization';
COMMENT ON FUNCTION public.get_organization_roles IS 'Returns all available roles (global + custom) for a specific organization';
COMMENT ON FUNCTION public.safe_delete_custom_role IS 'Safely deletes a custom role only if it is not assigned to any users';
COMMENT ON FUNCTION public.user_has_specific_permission IS 'Checks if a user has a specific permission for a resource and action';
COMMENT ON VIEW public.all_roles IS 'Consolidated view of all roles (global and custom) across all organizations';