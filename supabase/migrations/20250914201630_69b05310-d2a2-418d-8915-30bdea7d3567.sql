-- Fix invitation and custom role assignment system

-- 1. Add function to handle invitation acceptance and role assignment
CREATE OR REPLACE FUNCTION public.accept_invitation_and_assign_roles(p_user_id uuid, p_invitation_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  invitation_record RECORD;
  custom_role_names TEXT[];
BEGIN
  -- Get invitation details
  SELECT * INTO invitation_record
  FROM invitations
  WHERE id = p_invitation_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Invitation not found or already used');
  END IF;
  
  -- Check if invitation is expired
  IF invitation_record.expires_at < now() THEN
    RETURN json_build_object('error', 'Invitation has expired');
  END IF;
  
  -- Update the user's profile with organization and role
  UPDATE profiles
  SET 
    organization_id = invitation_record.organization_id,
    role = invitation_record.role,
    first_name = COALESCE(first_name, invitation_record.first_name),
    last_name = COALESCE(last_name, invitation_record.last_name),
    department = COALESCE(department, invitation_record.department),
    updated_at = now()
  WHERE user_id = p_user_id;
  
  -- Get custom roles associated with this invitation
  SELECT ARRAY_AGG(role_name) INTO custom_role_names
  FROM invitation_custom_roles
  WHERE invitation_id = p_invitation_id;
  
  -- Assign custom roles if any
  IF custom_role_names IS NOT NULL THEN
    INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
    SELECT p_user_id, unnest(custom_role_names), invitation_record.organization_id, invitation_record.invited_by
    ON CONFLICT (user_id, role_name, organization_id) DO NOTHING;
  END IF;
  
  -- Mark invitation as accepted
  UPDATE invitations
  SET status = 'accepted', updated_at = now()
  WHERE id = p_invitation_id;
  
  -- Clean up custom role entries for this invitation
  DELETE FROM invitation_custom_roles WHERE invitation_id = p_invitation_id;
  
  RETURN json_build_object('success', true, 'message', 'Invitation accepted and roles assigned');
END;
$$;

-- 2. Create trigger to automatically handle new user signup with invitations
CREATE OR REPLACE FUNCTION public.handle_new_user_with_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
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
    -- User has an invitation - use invitation details
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
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data ->> 'first_name', invitation_record.first_name),
      COALESCE(NEW.raw_user_meta_data ->> 'last_name', invitation_record.last_name),
      NEW.email,
      invitation_record.organization_id,
      invitation_record.role,
      invitation_record.department,
      FALSE,
      now(),
      now()
    );
    
    -- Get custom roles for this invitation
    SELECT ARRAY_AGG(role_name) INTO custom_role_names
    FROM invitation_custom_roles
    WHERE invitation_id = invitation_record.id;
    
    -- Assign custom roles if any
    IF custom_role_names IS NOT NULL THEN
      INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
      SELECT NEW.id, unnest(custom_role_names), invitation_record.organization_id, invitation_record.invited_by;
    END IF;
    
    -- Mark invitation as accepted
    UPDATE invitations
    SET status = 'accepted', updated_at = now()
    WHERE id = invitation_record.id;
    
    -- Clean up custom role entries
    DELETE FROM invitation_custom_roles WHERE invitation_id = invitation_record.id;
    
  ELSE
    -- No invitation - create new organization (existing logic)
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
      'superadmin'::public.user_role,
      TRUE,
      now(),
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Update the trigger to use new function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_with_invitation();