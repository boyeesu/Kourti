-- Update the handle_new_user_with_invitation function to use organization details from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user_with_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  invitation_record RECORD;
  custom_role_names TEXT[];
  new_org_id uuid;
  org_name text;
  org_details jsonb;
BEGIN
  -- Check if there's a pending invitation for this email
  SELECT * INTO invitation_record
  FROM invitations
  WHERE email = NEW.email AND status = 'pending' AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF FOUND THEN
    -- User has an invitation - create profile WITHOUT role (use assignments instead)
    INSERT INTO public.profiles (
      user_id, 
      first_name, 
      last_name, 
      email, 
      organization_id,
      is_organization_creator,
      verified_at,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data ->> 'first_name', invitation_record.first_name),
      COALESCE(NEW.raw_user_meta_data ->> 'last_name', invitation_record.last_name),
      NEW.email,
      invitation_record.organization_id,
      FALSE,
      now(),
      now(),
      now()
    );
    
    -- Assign the invitation role to user_role_assignments
    INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
    VALUES (NEW.id, invitation_record.role::text, invitation_record.organization_id, invitation_record.invited_by)
    ON CONFLICT (user_id, role_name, organization_id) DO NOTHING;
    
    -- Get custom roles for this invitation
    SELECT ARRAY_AGG(role_name) INTO custom_role_names
    FROM invitation_custom_roles
    WHERE invitation_id = invitation_record.id;
    
    -- Assign custom roles if any
    IF custom_role_names IS NOT NULL THEN
      INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
      SELECT NEW.id, unnest(custom_role_names), invitation_record.organization_id, invitation_record.invited_by
      ON CONFLICT (user_id, role_name, organization_id) DO NOTHING;
    END IF;
    
    -- Mark invitation as accepted
    UPDATE invitations
    SET status = 'accepted', updated_at = now()
    WHERE id = invitation_record.id;
    
    -- Clean up custom role entries
    DELETE FROM invitation_custom_roles WHERE invitation_id = invitation_record.id;
    
  ELSE
    -- No invitation - create new organization (org creator)
    -- Get organization details from metadata if provided
    org_details := NEW.raw_user_meta_data -> 'organization_details';
    
    IF org_details IS NOT NULL THEN
      -- Use detailed organization info from metadata
      INSERT INTO public.organizations (
        name, 
        email, 
        description,
        address,
        state,
        country,
        phone,
        created_at, 
        updated_at
      )
      VALUES (
        COALESCE(org_details ->> 'name', CONCAT(
          COALESCE(NEW.raw_user_meta_data ->> 'first_name', 'User'), 
          ' ', 
          COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
          ' Organization'
        )),
        COALESCE(org_details ->> 'email', NEW.email),
        org_details ->> 'description',
        org_details ->> 'address',
        org_details ->> 'state',
        org_details ->> 'country',
        org_details ->> 'phone',
        now(),
        now()
      )
      RETURNING id INTO new_org_id;
    ELSE
      -- Fallback to simple organization creation
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
    END IF;

    -- Create profile WITHOUT role
    INSERT INTO public.profiles (
      user_id, 
      first_name, 
      last_name, 
      email, 
      organization_id,
      is_organization_creator,
      verified_at,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data ->> 'first_name',
      NEW.raw_user_meta_data ->> 'last_name',
      NEW.email,
      new_org_id,
      TRUE,
      now(),
      now(),
      now()
    );
    
    -- Assign superadmin role via user_role_assignments
    INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
    VALUES (NEW.id, 'superadmin', new_org_id, NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;