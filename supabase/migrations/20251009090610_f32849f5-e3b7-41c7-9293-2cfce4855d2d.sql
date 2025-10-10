-- CRITICAL SECURITY FIXES: Role Storage Architecture & RLS Vulnerabilities

-- =====================================================
-- 1. Fix user_roles RLS policy (CRITICAL: OR true vulnerability)
-- =====================================================

DROP POLICY IF EXISTS "Users can view case types or superadmins/service can manage all" ON public.user_roles;

-- Users can view roles in their organization
CREATE POLICY "Users can view roles in their organization"
ON public.user_roles FOR SELECT
USING (organization_id = get_current_user_organization_id());

-- Only admins can manage (create, update, delete) custom roles
CREATE POLICY "Admins can manage roles in their organization"
ON public.user_roles FOR ALL
USING (
  organization_id = get_current_user_organization_id() AND
  is_user_admin()
);

-- =====================================================
-- 2. Migrate all roles to user_role_assignments (fixing dual storage)
-- =====================================================

-- First, migrate existing profiles.role to user_role_assignments
-- Only migrate if they don't already have an assignment
INSERT INTO public.user_role_assignments (user_id, role_name, organization_id, assigned_by)
SELECT 
  p.user_id,
  p.role::text,
  p.organization_id,
  p.user_id -- self-assigned for migration
FROM public.profiles p
WHERE p.role IS NOT NULL
  AND p.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    WHERE ura.user_id = p.user_id 
      AND ura.role_name = p.role::text
      AND ura.organization_id = p.organization_id
  )
ON CONFLICT (user_id, role_name, organization_id) DO NOTHING;

-- =====================================================
-- 3. Update is_user_admin() to use user_role_assignments
-- =====================================================

CREATE OR REPLACE FUNCTION public.is_user_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  has_admin_role BOOLEAN;
BEGIN
  -- Check if user has admin or superadmin role in user_role_assignments
  SELECT EXISTS(
    SELECT 1
    FROM public.user_role_assignments ura
    WHERE ura.user_id = auth.uid()
      AND ura.organization_id = get_current_user_organization_id()
      AND ura.role_name IN ('admin', 'superadmin')
  ) INTO has_admin_role;
  
  RETURN COALESCE(has_admin_role, false);
END;
$function$;

-- =====================================================
-- 4. Update user_has_permission to use new architecture
-- =====================================================

CREATE OR REPLACE FUNCTION public.user_has_permission(p_user_id uuid, p_resource text, p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  org_id UUID;
  has_permission BOOLEAN := false;
  user_roles TEXT[];
BEGIN
  -- Get user's organization
  SELECT organization_id INTO org_id
  FROM profiles
  WHERE user_id = p_user_id;
  
  -- Get all roles for the user
  SELECT ARRAY_AGG(role_name) INTO user_roles
  FROM user_role_assignments
  WHERE user_id = p_user_id AND organization_id = org_id;
  
  -- If no roles found, deny access
  IF user_roles IS NULL OR array_length(user_roles, 1) = 0 THEN
    RETURN false;
  END IF;
  
  -- Superadmins have all permissions
  IF 'superadmin' = ANY(user_roles) THEN
    RETURN true;
  END IF;
  
  -- Default permissions for global roles
  IF 'admin' = ANY(user_roles) THEN
    -- Admins get full CRUD permissions by default
    IF p_action IN ('create', 'read', 'update', 'delete', 'manage') THEN
      has_permission := true;
    END IF;
  ELSIF 'user' = ANY(user_roles) THEN
    -- Users get CRU permissions by default (no delete)
    IF p_action IN ('create', 'read', 'update') THEN
      has_permission := true;
    END IF;
  END IF;
  
  -- Check explicit permissions for all roles (overrides defaults)
  FOR i IN 1..array_length(user_roles, 1) LOOP
    SELECT COALESCE(granted, false) INTO has_permission
    FROM role_permissions
    WHERE role_name = user_roles[i]
      AND organization_id = org_id
      AND resource = p_resource
      AND action = p_action;
    
    -- If any role grants permission, return true
    IF has_permission THEN
      RETURN true;
    END IF;
  END LOOP;
  
  RETURN COALESCE(has_permission, false);
END;
$function$;

-- =====================================================
-- 5. Add comment to profiles.role indicating deprecation
-- =====================================================

COMMENT ON COLUMN public.profiles.role IS 'DEPRECATED: Use user_role_assignments table instead. This column is kept for backward compatibility only.';

-- =====================================================
-- 6. Update handle_new_user_with_invitation to use new system
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_new_user_with_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  invitation_record RECORD;
  custom_role_names TEXT[];
  new_org_id uuid;
  org_name text;
BEGIN
  -- Check if there's a pending invitation for this email
  SELECT * INTO invitation_record
  FROM invitations
  WHERE email = NEW.email AND status = 'pending' AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF FOUND THEN
    -- User has an invitation - create profile WITHOUT role (use assignments instead)
    INSERT INTO public.profiles (
      user_id, 
      first_name, 
      last_name, 
      email, 
      organization_id,
      is_organization_creator,
      verified_at,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data ->> 'first_name', invitation_record.first_name),
      COALESCE(NEW.raw_user_meta_data ->> 'last_name', invitation_record.last_name),
      NEW.email,
      invitation_record.organization_id,
      FALSE,
      now(),
      now(),
      now()
    );
    
    -- Assign the invitation role to user_role_assignments
    INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
    VALUES (NEW.id, invitation_record.role::text, invitation_record.organization_id, invitation_record.invited_by)
    ON CONFLICT (user_id, role_name, organization_id) DO NOTHING;
    
    -- Get custom roles for this invitation
    SELECT ARRAY_AGG(role_name) INTO custom_role_names
    FROM invitation_custom_roles
    WHERE invitation_id = invitation_record.id;
    
    -- Assign custom roles if any
    IF custom_role_names IS NOT NULL THEN
      INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
      SELECT NEW.id, unnest(custom_role_names), invitation_record.organization_id, invitation_record.invited_by
      ON CONFLICT (user_id, role_name, organization_id) DO NOTHING;
    END IF;
    
    -- Mark invitation as accepted
    UPDATE invitations
    SET status = 'accepted', updated_at = now()
    WHERE id = invitation_record.id;
    
    -- Clean up custom role entries
    DELETE FROM invitation_custom_roles WHERE invitation_id = invitation_record.id;
    
  ELSE
    -- No invitation - create new organization (org creator)
    org_name := COALESCE(
      NEW.raw_user_meta_data ->> 'organization',
      CONCAT(
        COALESCE(NEW.raw_user_meta_data ->> 'first_name', 'User'), 
        ' ', 
        COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
        ' Organization'
      )
    );

    INSERT INTO public.organizations (name, email, created_at, updated_at)
    VALUES (org_name, NEW.email, now(), now())
    RETURNING id INTO new_org_id;

    -- Create profile WITHOUT role
    INSERT INTO public.profiles (
      user_id, 
      first_name, 
      last_name, 
      email, 
      organization_id,
      is_organization_creator,
      verified_at,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data ->> 'first_name',
      NEW.raw_user_meta_data ->> 'last_name',
      NEW.email,
      new_org_id,
      TRUE,
      now(),
      now(),
      now()
    );
    
    -- Assign superadmin role via user_role_assignments
    INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
    VALUES (NEW.id, 'superadmin', new_org_id, NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;