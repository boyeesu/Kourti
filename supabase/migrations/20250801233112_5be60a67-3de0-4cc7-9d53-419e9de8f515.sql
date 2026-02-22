-- Create user roles enum
CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'user');

-- Update profiles table role column to use the enum
ALTER TABLE profiles 
ALTER COLUMN role TYPE user_role USING role::user_role;

ALTER TABLE profiles 
ALTER COLUMN role SET DEFAULT 'user';

-- Add is_organization_creator column to track who created the organization
ALTER TABLE profiles 
ADD COLUMN is_organization_creator BOOLEAN DEFAULT FALSE;

-- Update existing profiles to mark the current user as organization creator
UPDATE profiles 
SET is_organization_creator = TRUE 
WHERE role = 'superadmin';

-- Create function to automatically create organization and set user as superadmin for new signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_org_id uuid;
  org_name text;
BEGIN
  -- Extract organization name from user metadata, default to user's name + " Organization"
  org_name := COALESCE(
    NEW.raw_user_meta_data ->> 'organization',
    CONCAT(
      COALESCE(NEW.raw_user_meta_data ->> 'first_name', 'User'), 
      ' ', 
      COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
      ' Organization'
    )
  );

  -- Create new organization for the user
  INSERT INTO public.organizations (name, email, created_at, updated_at)
  VALUES (org_name, NEW.email, now(), now())
  RETURNING id INTO new_org_id;

  -- Create profile with superadmin role and link to organization
  INSERT INTO public.profiles (
    user_id, 
    first_name, 
    last_name, 
    email, 
    organization_id, 
    role, 
    is_organization_creator,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    NEW.email,
    new_org_id,
    'superadmin',
    TRUE,
    now(),
    now()
  );

  RETURN NEW;
END;
$$;

-- Update the trigger to use the new function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Create function to invite users to organization
CREATE OR REPLACE FUNCTION public.invite_user_to_organization(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_role user_role,
  p_department text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_role user_role;
  current_org_id uuid;
  invited_user_id uuid;
  result json;
BEGIN
  -- Get current user's role and organization
  SELECT role, organization_id INTO current_user_role, current_org_id
  FROM public.profiles 
  WHERE user_id = auth.uid();

  -- Check if current user has permission to invite users
  IF current_user_role NOT IN ('superadmin', 'admin') THEN
    RETURN json_build_object('error', 'Insufficient permissions to invite users');
  END IF;

  -- Check if user already exists
  SELECT id INTO invited_user_id
  FROM auth.users
  WHERE email = p_email;

  IF invited_user_id IS NOT NULL THEN
    RETURN json_build_object('error', 'User with this email already exists');
  END IF;

  -- For now, we'll create a pending invitation record
  -- In a real implementation, you'd integrate with Supabase Auth to send invitation emails
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
    gen_random_uuid(), -- Temporary ID until user signs up
    p_first_name,
    p_last_name,
    p_email,
    current_org_id,
    p_role,
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