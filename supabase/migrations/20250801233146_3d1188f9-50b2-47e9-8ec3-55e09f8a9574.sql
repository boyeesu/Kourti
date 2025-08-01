-- Create user roles enum
CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'user');

-- Add is_organization_creator column first
ALTER TABLE profiles 
ADD COLUMN is_organization_creator BOOLEAN DEFAULT FALSE;

-- Update existing profiles to mark the current user as organization creator
UPDATE profiles 
SET is_organization_creator = TRUE 
WHERE role = 'superadmin';

-- Add a new role column with the enum type
ALTER TABLE profiles 
ADD COLUMN role_new user_role DEFAULT 'user';

-- Copy existing role values to the new column
UPDATE profiles 
SET role_new = CASE 
  WHEN role = 'superadmin' THEN 'superadmin'::user_role
  WHEN role = 'admin' THEN 'admin'::user_role
  ELSE 'user'::user_role
END;

-- Drop the old role column and rename the new one
ALTER TABLE profiles DROP COLUMN role;
ALTER TABLE profiles RENAME COLUMN role_new TO role;

-- Make the role column NOT NULL
ALTER TABLE profiles ALTER COLUMN role SET NOT NULL;

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
    'superadmin'::user_role,
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