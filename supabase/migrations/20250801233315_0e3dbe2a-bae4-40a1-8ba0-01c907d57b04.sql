-- Create function to invite users to organization (using text for role parameter for now)
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
SET search_path = ''
AS $$
DECLARE
  current_user_role text;
  current_org_id uuid;
  invited_user_id uuid;
  result json;
BEGIN
  -- Get current user's role and organization
  SELECT role::text, organization_id INTO current_user_role, current_org_id
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

  -- Validate role parameter
  IF p_role NOT IN ('superadmin', 'admin', 'user') THEN
    RETURN json_build_object('error', 'Invalid role specified');
  END IF;

  -- For now, we'll create a pending invitation record
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