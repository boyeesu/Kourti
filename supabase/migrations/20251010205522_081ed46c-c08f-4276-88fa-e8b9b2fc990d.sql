-- Update invite_user_to_organization to check user_role_assignments instead of profiles.role
CREATE OR REPLACE FUNCTION public.invite_user_to_organization(p_email text, p_first_name text, p_last_name text, p_role text, p_department text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_user_roles text[];
  current_org_id uuid;
  invited_user_id uuid;
  normalized_role public.user_role;
  is_valid_role boolean := false;
BEGIN
  -- Get current user's organization
  SELECT organization_id INTO current_org_id
  FROM public.profiles
  WHERE user_id = auth.uid();

  -- Get current user's roles from user_role_assignments
  SELECT ARRAY_AGG(role_name) INTO current_user_roles
  FROM public.user_role_assignments
  WHERE user_id = auth.uid() AND organization_id = current_org_id;

  -- Check if user has admin or superadmin role
  IF NOT ('superadmin' = ANY(current_user_roles) OR 'admin' = ANY(current_user_roles)) THEN
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
  IF p_role IN ('superadmin','admin') AND NOT ('superadmin' = ANY(current_user_roles)) THEN
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
          department = p_department,
          first_name = COALESCE(first_name, p_first_name),
          last_name = COALESCE(last_name, p_last_name),
          updated_at = now()
      WHERE user_id = invited_user_id;
    ELSE
      INSERT INTO public.profiles(
        user_id, first_name, last_name, organization_id, department, 
        is_organization_creator, created_at, updated_at
      ) VALUES (
        invited_user_id, p_first_name, p_last_name, current_org_id, 
        p_department, false, now(), now()
      );
    END IF;

    -- Assign role via user_role_assignments
    INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
    VALUES (invited_user_id, p_role, current_org_id, auth.uid())
    ON CONFLICT (user_id, role_name, organization_id) DO NOTHING;

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
$function$;

-- Update toggle_user_status to check user_role_assignments
CREATE OR REPLACE FUNCTION public.toggle_user_status(target_user_id uuid, disable boolean DEFAULT true)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_user_roles text[];
  current_org_id uuid;
  target_org_id uuid;
BEGIN
  -- Get current user's organization
  SELECT organization_id INTO current_org_id
  FROM public.profiles
  WHERE user_id = auth.uid();

  -- Get current user's roles
  SELECT ARRAY_AGG(role_name) INTO current_user_roles
  FROM public.user_role_assignments
  WHERE user_id = auth.uid() AND organization_id = current_org_id;

  -- Only superadmins can disable/enable users
  IF NOT ('superadmin' = ANY(current_user_roles)) THEN
    RETURN json_build_object('error', 'Only superadmins can disable/enable users');
  END IF;

  -- Get target user's organization
  SELECT organization_id INTO target_org_id
  FROM public.profiles
  WHERE user_id = target_user_id;

  -- Ensure target user is in same organization
  IF target_org_id != current_org_id THEN
    RETURN json_build_object('error', 'User not found in your organization');
  END IF;

  -- Update the user's status
  IF disable THEN
    UPDATE public.profiles
    SET status = 'disabled',
        disabled_at = now(),
        disabled_by = auth.uid(),
        updated_at = now()
    WHERE user_id = target_user_id;
  ELSE
    UPDATE public.profiles
    SET status = 'active',
        disabled_at = NULL,
        disabled_by = NULL,
        updated_at = now()
    WHERE user_id = target_user_id;
  END IF;

  RETURN json_build_object(
    'success', true, 
    'message', 
    CASE WHEN disable THEN 'User disabled successfully' ELSE 'User enabled successfully' END
  );
END;
$function$;