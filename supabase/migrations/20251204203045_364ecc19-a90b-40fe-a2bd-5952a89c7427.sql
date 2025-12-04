-- Fix user_has_specific_permission function to prevent permission enumeration
-- Add validation that caller must be in same org as target user OR be an admin

CREATE OR REPLACE FUNCTION public.user_has_specific_permission(p_user_id uuid, p_resource text, p_action text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id UUID;
  v_caller_org_id UUID;
  v_has_permission BOOLEAN := false;
  v_user_role_names TEXT[];
  v_caller_role_names TEXT[];
BEGIN
  -- Get caller's organization and roles
  SELECT organization_id INTO v_caller_org_id
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  IF v_caller_org_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Get target user's organization
  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE user_id = p_user_id;
  
  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Security check: caller must be in same organization as target user
  IF v_caller_org_id != v_org_id THEN
    RETURN false;
  END IF;
  
  -- If checking own permissions, allow
  -- If checking another user's permissions, must be admin/superadmin
  IF p_user_id != auth.uid() THEN
    SELECT ARRAY_AGG(role_name) INTO v_caller_role_names
    FROM public.user_role_assignments
    WHERE user_id = auth.uid() AND organization_id = v_caller_org_id;
    
    IF NOT ('superadmin' = ANY(COALESCE(v_caller_role_names, ARRAY[]::TEXT[])) OR 
            'admin' = ANY(COALESCE(v_caller_role_names, ARRAY[]::TEXT[]))) THEN
      RETURN false; -- Non-admins cannot check other users' permissions
    END IF;
  END IF;
  
  -- Get all role names for the target user
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
$function$;