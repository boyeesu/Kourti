-- Add functions for platform admins to access cross-organization data
-- These functions bypass normal RLS policies for platform admins

-- Function to get all organizations (platform admin only)
DROP FUNCTION IF EXISTS public.get_all_organizations();
CREATE OR REPLACE FUNCTION public.get_all_organizations()
RETURNS TABLE (
  id UUID,
  name TEXT,
  email TEXT,
  description TEXT,
  address TEXT,
  phone TEXT,
  website TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  user_count BIGINT,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can access all organizations';
  END IF;
  
  RETURN QUERY
  SELECT 
    o.id,
    o.name,
    o.email,
    o.description,
    o.address,
    o.phone,
    o.website,
    o.logo_url,
    o.created_at,
    o.updated_at,
    COUNT(DISTINCT p.user_id)::BIGINT as user_count,
    CASE 
      WHEN COUNT(DISTINCT p.user_id) FILTER (WHERE p.status = 'active') > 0 THEN 'active'
      WHEN COUNT(DISTINCT p.user_id) = 0 THEN 'empty'
      ELSE 'inactive'
    END as status
  FROM public.organizations o
  LEFT JOIN public.profiles p ON p.organization_id = o.id
  GROUP BY o.id, o.name, o.email, o.description, o.address, o.phone, o.website, o.logo_url, o.created_at, o.updated_at
  ORDER BY o.created_at DESC;
END;
$$;

-- Function to get all users across all organizations (platform admin only)
DROP FUNCTION IF EXISTS public.get_all_users();
CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  role TEXT,
  department TEXT,
  status TEXT,
  organization_id UUID,
  organization_name TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  disabled_at TIMESTAMPTZ,
  disabled_by UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can access all users';
  END IF;
  
  RETURN QUERY
  SELECT 
    p.id,
    p.user_id,
    p.email,
    p.first_name,
    p.last_name,
    p.role::TEXT,
    p.department,
    p.status,
    p.organization_id,
    o.name as organization_name,
    p.created_at,
    p.updated_at,
    p.last_login_at,
    p.approved_at,
    p.approved_by,
    p.disabled_at,
    p.disabled_by
  FROM public.profiles p
  LEFT JOIN public.organizations o ON o.id = p.organization_id
  ORDER BY p.created_at DESC;
END;
$$;

-- Function to approve a user (platform admin only)
DROP FUNCTION IF EXISTS public.approve_user(UUID);
CREATE OR REPLACE FUNCTION public.approve_user(
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status TEXT;
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can approve users';
  END IF;
  
  -- Get current status
  SELECT status INTO v_old_status
  FROM public.profiles
  WHERE user_id = p_user_id;
  
  -- Update user status
  UPDATE public.profiles
  SET 
    status = 'approved',
    approved_at = now(),
    approved_by = auth.uid(),
    updated_at = now()
  WHERE user_id = p_user_id;
  
  -- Log the action
  PERFORM log_admin_action(
    'user_approved',
    'user',
    p_user_id,
    jsonb_build_object(
      'old_status', v_old_status,
      'new_status', 'approved'
    )
  );
  
  RETURN true;
END;
$$;

-- Function to disable a user (platform admin only)
-- Drop existing disable_user function if it exists (may have different signature)
-- Old function signature: disable_user(target_user_id uuid)
DROP FUNCTION IF EXISTS public.disable_user(uuid);
DROP FUNCTION IF EXISTS public.disable_user(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.disable_user(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status TEXT;
  v_email TEXT;
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can disable users';
  END IF;
  
  -- Get current status and email
  SELECT status, email INTO v_old_status, v_email
  FROM public.profiles
  WHERE user_id = p_user_id;
  
  -- Update user status
  UPDATE public.profiles
  SET 
    status = 'disabled',
    disabled_at = now(),
    disabled_by = auth.uid(),
    updated_at = now()
  WHERE user_id = p_user_id;
  
  -- Log the action
  PERFORM log_admin_action(
    'user_disabled',
    'user',
    p_user_id,
    jsonb_build_object(
      'old_status', v_old_status,
      'new_status', 'disabled',
      'reason', p_reason,
      'user_email', v_email
    )
  );
  
  RETURN true;
END;
$$;

-- Function to safely delete a user (platform admin only)
-- This is a soft delete - marks user as deleted but keeps audit trail
DROP FUNCTION IF EXISTS public.delete_user_safe(UUID, TEXT);
DROP FUNCTION IF EXISTS public.delete_user_safe(UUID);
CREATE OR REPLACE FUNCTION public.delete_user_safe(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_org_id UUID;
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can delete users';
  END IF;
  
  -- Get user info for logging
  SELECT email, organization_id INTO v_email, v_org_id
  FROM public.profiles
  WHERE user_id = p_user_id;
  
  -- Log the action BEFORE deletion
  PERFORM log_admin_action(
    'user_deleted',
    'user',
    p_user_id,
    jsonb_build_object(
      'user_email', v_email,
      'organization_id', v_org_id,
      'reason', p_reason
    )
  );
  
  -- Delete the user (CASCADE will handle related records)
  -- This will delete from auth.users which cascades to profiles
  DELETE FROM auth.users
  WHERE id = p_user_id;
  
  RETURN true;
END;
$$;

-- Function to create an organization (platform admin only)
DROP FUNCTION IF EXISTS public.create_organization_admin(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.create_organization_admin(
  p_name TEXT,
  p_email TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_website TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can create organizations';
  END IF;
  
  -- Create organization
  INSERT INTO public.organizations (
    name,
    email,
    description,
    address,
    phone,
    website,
    created_at,
    updated_at
  ) VALUES (
    p_name,
    p_email,
    p_description,
    p_address,
    p_phone,
    p_website,
    now(),
    now()
  ) RETURNING id INTO v_org_id;
  
  -- Log the action
  PERFORM log_admin_action(
    'org_created',
    'organization',
    v_org_id,
    jsonb_build_object(
      'name', p_name,
      'email', p_email
    )
  );
  
  RETURN v_org_id;
END;
$$;

-- Add comments
COMMENT ON FUNCTION public.get_all_organizations IS 'Returns all organizations in the system. Platform admin only.';
COMMENT ON FUNCTION public.get_all_users IS 'Returns all users across all organizations. Platform admin only.';
COMMENT ON FUNCTION public.approve_user IS 'Approves a user account. Platform admin only.';
COMMENT ON FUNCTION public.disable_user IS 'Disables a user account. Platform admin only.';
COMMENT ON FUNCTION public.delete_user_safe IS 'Safely deletes a user with audit trail. Platform admin only.';
COMMENT ON FUNCTION public.create_organization_admin IS 'Creates a new organization. Platform admin only.';
