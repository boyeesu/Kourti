-- Fix foreign key constraints to allow user deletion
-- This allows platform admins to delete users without foreign key constraint errors

-- Make user_roles.created_by nullable and add ON DELETE SET NULL
ALTER TABLE public.user_roles 
  ALTER COLUMN created_by DROP NOT NULL;

-- Drop existing foreign key constraint
ALTER TABLE public.user_roles 
  DROP CONSTRAINT IF EXISTS user_roles_created_by_fkey;

-- Recreate with ON DELETE SET NULL
ALTER TABLE public.user_roles 
  ADD CONSTRAINT user_roles_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Update delete_user_safe function to handle all foreign key references
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
  
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
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
  
  -- Handle foreign key references before deletion
  -- Set created_by to NULL in user_roles (now nullable)
  UPDATE public.user_roles
  SET created_by = NULL
  WHERE created_by = p_user_id;
  
  -- Delete the user (CASCADE will handle related records in profiles and other tables)
  -- This will delete from auth.users which cascades to profiles
  DELETE FROM auth.users
  WHERE id = p_user_id;
  
  RETURN true;
END;
$$;

-- Also create a function to delete organizations (platform admin only)
CREATE OR REPLACE FUNCTION public.delete_organization_safe(
  p_org_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_name TEXT;
  v_user_count INTEGER;
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can delete organizations';
  END IF;
  
  -- Get organization info for logging
  SELECT name, COUNT(DISTINCT p.user_id)::INTEGER
  INTO v_org_name, v_user_count
  FROM public.organizations o
  LEFT JOIN public.profiles p ON p.organization_id = o.id
  WHERE o.id = p_org_id
  GROUP BY o.id, o.name;
  
  IF v_org_name IS NULL THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;
  
  -- Warn if organization has users
  IF v_user_count > 0 THEN
    RAISE WARNING 'Organization has % users. They will be deleted along with the organization.', v_user_count;
  END IF;
  
  -- Log the action BEFORE deletion
  PERFORM log_admin_action(
    'organization_deleted',
    'organization',
    p_org_id,
    jsonb_build_object(
      'organization_name', v_org_name,
      'user_count', v_user_count,
      'reason', p_reason
    )
  );
  
  -- Delete the organization (CASCADE will handle related records)
  DELETE FROM public.organizations
  WHERE id = p_org_id;
  
  RETURN true;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.delete_organization_safe(UUID, TEXT) TO authenticated;
