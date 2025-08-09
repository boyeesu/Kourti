-- Migration: Fix invite_user_to_organization search_path and schema

-- Ensure function is created in public schema and has proper search_path
CREATE OR REPLACE FUNCTION public.invite_user_to_organization(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_role text,
  p_department text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  current_user_role text;
  current_org_id uuid;
  invited_user_id uuid;
BEGIN
  -- Get current user's role and organization
  SELECT role::text, organization_id INTO current_user_role, current_org_id
  FROM public.profiles 
  WHERE user_id = auth.uid();

  -- Check permissions
  IF current_user_role NOT IN ('superadmin', 'admin') THEN
    RETURN json_build_object('error', 'Insufficient permissions to invite users');
  END IF;

  -- Check if user already exists in auth.users
  SELECT id INTO invited_user_id
  FROM auth.users
  WHERE email = p_email;

  IF invited_user_id IS NOT NULL THEN
    RETURN json_build_object('error', 'User with this email already exists');
  END IF;

  -- Validate role param
  IF p_role NOT IN ('superadmin', 'admin', 'user') THEN
    RETURN json_build_object('error', 'Invalid role specified');
  END IF;

  -- Insert invitation as pending profile
  INSERT INTO public.profiles (
    user_id,
    first_name,
    last_name,
    email,
    organization_id,
    role,
    department,
    is_organization_creator,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_first_name,
    p_last_name,
    p_email,
    current_org_id,
    p_role::user_role,
    p_department,
    FALSE,
    now(),
    now()
  );

  RETURN json_build_object(
    'success', true,
    'message', 'User invitation created successfully'
  );
END;
$$;
