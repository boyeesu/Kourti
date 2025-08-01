-- First, let's fix the database structure and add proper relationships

-- Add foreign key constraints that are missing
ALTER TABLE cases 
ADD CONSTRAINT fk_cases_client_id 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE cases 
ADD CONSTRAINT fk_cases_assigned_to 
FOREIGN KEY (assigned_to) REFERENCES profiles(user_id) ON DELETE SET NULL;

ALTER TABLE documents 
ADD CONSTRAINT fk_documents_case_id 
FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE SET NULL;

ALTER TABLE documents 
ADD CONSTRAINT fk_documents_client_id 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE contracts 
ADD CONSTRAINT fk_contracts_client_id 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE calendar_events 
ADD CONSTRAINT fk_calendar_events_case_id 
FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE SET NULL;

ALTER TABLE calendar_events 
ADD CONSTRAINT fk_calendar_events_client_id 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

-- Create user roles enum
CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'user');

-- Update profiles table to add role and make organization_id required
ALTER TABLE profiles 
ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE profiles 
ALTER COLUMN role TYPE user_role USING role::user_role;

ALTER TABLE profiles 
ALTER COLUMN role SET DEFAULT 'user';

-- Add is_organization_creator column to track who created the organization
ALTER TABLE profiles 
ADD COLUMN is_organization_creator BOOLEAN DEFAULT FALSE;

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

-- Update RLS policies to be more performant and use the new structure

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can view their organization" ON organizations;
DROP POLICY IF EXISTS "Users can update their organization" ON organizations;
DROP POLICY IF EXISTS "Users can view all profiles in their organization" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

-- Create optimized RLS policies for organizations
CREATE POLICY "Users can view their organization" 
ON organizations FOR SELECT 
USING (id = get_user_organization_id());

CREATE POLICY "Admins can update their organization" 
ON organizations FOR UPDATE 
USING (
  id = get_user_organization_id() AND 
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('superadmin', 'admin')
  )
);

-- Create optimized RLS policies for profiles
CREATE POLICY "Users can view profiles in their organization" 
ON profiles FOR SELECT 
USING (organization_id = get_user_organization_id());

CREATE POLICY "Users can insert profiles in their organization" 
ON profiles FOR INSERT 
WITH CHECK (
  organization_id = get_user_organization_id() OR
  user_id = auth.uid()
);

CREATE POLICY "Users can update their own profile or admins can update any profile in org" 
ON profiles FOR UPDATE 
USING (
  user_id = auth.uid() OR 
  (organization_id = get_user_organization_id() AND EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role IN ('superadmin', 'admin')
  ))
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_cases_organization_id ON cases(organization_id);
CREATE INDEX IF NOT EXISTS idx_cases_client_id ON cases(client_id);
CREATE INDEX IF NOT EXISTS idx_cases_assigned_to ON cases(assigned_to);
CREATE INDEX IF NOT EXISTS idx_clients_organization_id ON clients(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_organization_id ON documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_case_id ON documents(case_id);
CREATE INDEX IF NOT EXISTS idx_contracts_organization_id ON contracts(organization_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_organization_id ON calendar_events(organization_id);