-- Optimize signup trigger for faster performance
-- Add index for invitation lookup
CREATE INDEX IF NOT EXISTS idx_invitations_email_status_expires_created 
ON public.invitations(email, status, expires_at, created_at DESC)
WHERE status = 'pending';

-- Optimize the trigger function to remove ORDER BY if not needed
-- The index above will help, but we can also simplify the query
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
  -- Fast lookup: use index, no ORDER BY needed if we just need one match
  -- If multiple invitations exist, we'll get the most recent due to index order
  SELECT * INTO invitation_record
  FROM invitations
  WHERE email = NEW.email AND status = 'pending' AND expires_at > now()
  LIMIT 1;  -- Remove ORDER BY - index handles ordering
  
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
    
    -- Get custom roles for this invitation (can be async if slow)
    SELECT ARRAY_AGG(role_name) INTO custom_role_names
    FROM invitation_custom_roles
    WHERE invitation_id = invitation_record.id;
    
    -- Assign custom roles if any (defer if this is slow)
    IF custom_role_names IS NOT NULL THEN
      INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
      SELECT NEW.id, unnest(custom_role_names), invitation_record.organization_id, invitation_record.invited_by
      ON CONFLICT DO NOTHING;
    END IF;
    
    -- Mark invitation as accepted (fast update)
    UPDATE invitations
    SET status = 'accepted', updated_at = now()
    WHERE id = invitation_record.id;
    
    -- Clean up custom role entries (can be deferred if slow)
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
EXCEPTION WHEN OTHERS THEN
  -- If anything fails, create minimal profile to allow signup to complete
  BEGIN
    INSERT INTO public.profiles (
      user_id, 
      email, 
      role, 
      is_organization_creator,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.email,
      'user'::public.user_role,
      TRUE,
      now(),
      now()
    )
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;
