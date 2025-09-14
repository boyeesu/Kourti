-- Clean up and fix global roles and permissions system

-- 1. Remove global role entries from role_permissions table (global roles should use built-in logic)
DELETE FROM role_permissions WHERE role_name IN ('admin', 'user', 'superadmin');

-- 2. Update user_has_permission function to properly handle global vs custom roles
CREATE OR REPLACE FUNCTION public.user_has_permission(p_user_id uuid, p_resource text, p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  user_role TEXT;
  org_id UUID;
  has_permission BOOLEAN := false;
  custom_roles TEXT[];
BEGIN
  -- Get user's role and organization
  SELECT role::TEXT, organization_id
  INTO user_role, org_id
  FROM profiles
  WHERE user_id = p_user_id;
  
  -- Superadmins have all permissions
  IF user_role = 'superadmin' THEN
    RETURN true;
  END IF;
  
  -- Default permissions for global roles (built-in logic)
  IF user_role = 'admin' THEN
    -- Admins get full CRUD permissions by default
    IF p_action IN ('create', 'read', 'update', 'delete', 'manage') THEN
      has_permission := true;
    END IF;
  ELSIF user_role = 'user' THEN
    -- Users get CRU permissions by default (no delete)
    IF p_action IN ('create', 'read', 'update') THEN
      has_permission := true;
    END IF;
  END IF;
  
  -- Check custom role assignments and their explicit permissions
  SELECT ARRAY_AGG(role_name) INTO custom_roles
  FROM user_role_assignments
  WHERE user_id = p_user_id AND organization_id = org_id;
  
  -- Check permissions for each custom role (explicit permissions override defaults)
  IF custom_roles IS NOT NULL THEN
    FOR i IN 1..array_length(custom_roles, 1) LOOP
      SELECT COALESCE(granted, false)
      INTO has_permission
      FROM role_permissions
      WHERE role_name = custom_roles[i]
        AND organization_id = org_id
        AND resource = p_resource
        AND action = p_action;
      
      -- If any custom role grants permission, return true
      IF has_permission THEN
        RETURN true;
      END IF;
    END LOOP;
  END IF;
  
  RETURN COALESCE(has_permission, false);
END;
$$;

-- 3. Create function to set default permissions for custom roles
CREATE OR REPLACE FUNCTION public.initialize_custom_role_permissions(p_role_name text, p_organization_id uuid, p_created_by uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  resource_name text;
  action_name text;
BEGIN
  -- Set default read permissions for all resources for new custom roles
  FOREACH resource_name IN ARRAY ARRAY['cases', 'clients', 'documents', 'contracts', 'calendars', 'invoices', 'tasks']
  LOOP
    INSERT INTO role_permissions (role_name, organization_id, resource, action, granted, created_by)
    VALUES (p_role_name, p_organization_id, resource_name, 'read', true, p_created_by)
    ON CONFLICT (role_name, organization_id, resource, action) DO NOTHING;
  END LOOP;
END;
$$;

-- 4. Create trigger to initialize permissions for new custom roles
CREATE OR REPLACE FUNCTION public.trigger_initialize_custom_role_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Initialize default permissions for new custom role
  PERFORM initialize_custom_role_permissions(NEW.role_name, NEW.organization_id, NEW.created_by);
  RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_user_role_created ON user_roles;
CREATE TRIGGER on_user_role_created
  AFTER INSERT ON user_roles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_initialize_custom_role_permissions();