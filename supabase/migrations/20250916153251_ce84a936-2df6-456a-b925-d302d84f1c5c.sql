-- Ensure users who sign up get properly marked as verified
-- Update the existing trigger to set verified_at properly

CREATE OR REPLACE FUNCTION public.update_user_login()
RETURNS TRIGGER AS $$
BEGIN
    -- Update last_login_at and set verified_at if not set
    UPDATE public.profiles 
    SET 
        last_login_at = now(),
        verified_at = COALESCE(verified_at, now())
    WHERE user_id = NEW.id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Also update the new user creation function to set verified_at
CREATE OR REPLACE FUNCTION public.handle_new_user_with_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      verified_at, -- Set as verified when they sign up via invitation
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
      now(), -- Mark as verified immediately
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
      verified_at, -- Mark org creators as verified
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
      now(), -- Mark as verified immediately
      now(),
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;