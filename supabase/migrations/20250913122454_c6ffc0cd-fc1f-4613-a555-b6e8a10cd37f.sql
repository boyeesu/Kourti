-- First, let's populate the global_roles table with system roles
INSERT INTO global_roles (role, display_name, description) 
VALUES 
  ('superadmin', 'Super Administrator', 'Full system access and organization management'),
  ('admin', 'Administrator', 'Organization management and user administration'),
  ('user', 'User', 'Standard user access')
ON CONFLICT (role) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description;

-- Update the invite_user_to_organization function to handle both global and custom roles
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
SET search_path = public
AS $$
DECLARE
  current_user_role text;
  current_org_id uuid;
  invited_user_id uuid;
  normalized_role public.user_role;
  is_valid_role boolean := false;
BEGIN
  -- Get current user's role and organization
  SELECT role::text, organization_id INTO current_user_role, current_org_id
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF current_user_role NOT IN ('superadmin','admin') THEN
    RETURN json_build_object('error','Insufficient permissions to invite users');
  END IF;

  -- Check if role is valid (either global or custom role in organization)
  -- Check global roles first
  IF EXISTS(SELECT 1 FROM global_roles WHERE role = p_role) THEN
    is_valid_role := true;
  -- Check custom roles for this organization
  ELSIF EXISTS(SELECT 1 FROM user_roles WHERE role_name = p_role AND organization_id = current_org_id) THEN
    is_valid_role := true;
  END IF;

  IF NOT is_valid_role THEN
    RETURN json_build_object('error', 'Invalid role specified: ' || p_role);
  END IF;
  
  -- Additional security: Only superadmins can invite admins/superadmins
  IF p_role IN ('superadmin','admin') AND current_user_role != 'superadmin' THEN
    RETURN json_build_object('error','Only superadmins can invite admin users');
  END IF;

  -- For global roles, cast to user_role enum
  IF EXISTS(SELECT 1 FROM global_roles WHERE role = p_role) THEN
    normalized_role := p_role::public.user_role;
  ELSE
    -- For custom roles, default to 'user' enum but store actual role name
    normalized_role := 'user'::public.user_role;
  END IF;

  -- Check if user already exists
  SELECT id INTO invited_user_id FROM auth.users WHERE email = p_email;

  IF invited_user_id IS NOT NULL THEN
    -- Update existing user's profile
    IF EXISTS(SELECT 1 FROM public.profiles WHERE user_id = invited_user_id) THEN
      UPDATE public.profiles
      SET organization_id = current_org_id,
          role = normalized_role,
          department = p_department,
          first_name = COALESCE(first_name, p_first_name),
          last_name = COALESCE(last_name, p_last_name),
          updated_at = now()
      WHERE user_id = invited_user_id;
    ELSE
      INSERT INTO public.profiles(
        user_id, first_name, last_name, organization_id, role, department, 
        is_organization_creator, created_at, updated_at
      ) VALUES (
        invited_user_id, p_first_name, p_last_name, current_org_id, normalized_role, 
        p_department, false, now(), now()
      );
    END IF;

    -- For custom roles, also create a role assignment
    IF NOT EXISTS(SELECT 1 FROM global_roles WHERE role = p_role) THEN
      INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
      VALUES (invited_user_id, p_role, current_org_id, auth.uid())
      ON CONFLICT (user_id, role_name, organization_id) DO NOTHING;
    END IF;

    RETURN json_build_object('success', true, 'message', 'Existing user added to organization');
  END IF;

  -- Create new invitation
  INSERT INTO public.invitations(
    organization_id, email, first_name, last_name, role, department, invited_by
  ) VALUES (
    current_org_id, p_email, p_first_name, p_last_name, normalized_role, p_department, auth.uid()
  )
  ON CONFLICT (organization_id, email) WHERE status = 'pending' DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    role = EXCLUDED.role,
    department = EXCLUDED.department,
    invited_by = EXCLUDED.invited_by,
    expires_at = now() + interval '14 days',
    updated_at = now();

  -- Store custom role information for later processing
  IF NOT EXISTS(SELECT 1 FROM global_roles WHERE role = p_role) THEN
    INSERT INTO invitation_custom_roles (invitation_id, role_name)
    SELECT i.id, p_role
    FROM invitations i
    WHERE i.organization_id = current_org_id 
      AND i.email = p_email 
      AND i.status = 'pending'
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN json_build_object('success', true, 'message', 'Invitation created');
END;
$$;

-- Create tables for custom role assignments and invitation tracking
CREATE TABLE IF NOT EXISTS user_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role_name text NOT NULL,
  organization_id uuid NOT NULL,
  assigned_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, role_name, organization_id)
);

CREATE TABLE IF NOT EXISTS invitation_custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL,
  role_name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(invitation_id, role_name)
);

-- Enable RLS on new tables
ALTER TABLE user_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitation_custom_roles ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_role_assignments
CREATE POLICY "Users can view role assignments in their organization"
ON user_role_assignments FOR SELECT
USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Admins can manage role assignments in their organization"
ON user_role_assignments FOR ALL
USING (organization_id = get_current_user_organization_id() AND is_user_admin());

-- RLS policies for invitation_custom_roles
CREATE POLICY "Admins can manage invitation custom roles"
ON invitation_custom_roles FOR ALL
USING (EXISTS(
  SELECT 1 FROM invitations i 
  WHERE i.id = invitation_custom_roles.invitation_id 
    AND i.organization_id = get_current_user_organization_id()
    AND is_user_admin()
));

-- Update triggers
CREATE TRIGGER update_user_role_assignments_updated_at
  BEFORE UPDATE ON user_role_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update the user_has_permission function to handle custom roles
CREATE OR REPLACE FUNCTION public.user_has_permission(p_user_id uuid, p_resource text, p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
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
  
  -- Check permissions for global role
  SELECT COALESCE(granted, false)
  INTO has_permission
  FROM role_permissions
  WHERE role_name = user_role
    AND organization_id = org_id
    AND resource = p_resource
    AND action = p_action;
  
  -- If global role has permission, return true
  IF has_permission THEN
    RETURN true;
  END IF;
  
  -- Check custom role assignments
  SELECT ARRAY_AGG(role_name) INTO custom_roles
  FROM user_role_assignments
  WHERE user_id = p_user_id AND organization_id = org_id;
  
  -- Check permissions for each custom role
  IF custom_roles IS NOT NULL THEN
    FOR i IN 1..array_length(custom_roles, 1) LOOP
      SELECT COALESCE(granted, false)
      INTO has_permission
      FROM role_permissions
      WHERE role_name = custom_roles[i]
        AND organization_id = org_id
        AND resource = p_resource
        AND action = p_action;
      
      IF has_permission THEN
        RETURN true;
      END IF;
    END LOOP;
  END IF;
  
  -- Default permissions for system roles if not explicitly set
  IF has_permission IS NULL OR has_permission = false THEN
    -- Admins get most permissions by default
    IF user_role = 'admin' AND p_action IN ('create', 'read', 'update', 'delete') THEN
      has_permission := true;
    -- Regular users get read permissions by default
    ELSIF user_role = 'user' AND p_action = 'read' THEN
      has_permission := true;
    END IF;
  END IF;
  
  RETURN COALESCE(has_permission, false);
END;
$$;