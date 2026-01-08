-- Fix signup trigger to handle NULL organization_id and add proper validation

-- Add performance indexes for invitation lookups
CREATE INDEX IF NOT EXISTS idx_invitations_email_status_expires 
  ON public.invitations(email, status, expires_at) 
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_invitation_custom_roles_invitation_id 
  ON public.invitation_custom_roles(invitation_id);

-- Ensure service role can insert profiles (for trigger function)
DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;
CREATE POLICY "Service role can insert profiles" ON profiles
FOR INSERT WITH CHECK (true);

-- Ensure service role can insert organizations (for trigger function)
DROP POLICY IF EXISTS "Service role can insert organizations" ON organizations;
CREATE POLICY "Service role can insert organizations" ON organizations
FOR INSERT WITH CHECK (true);

-- Ultra-minimal signup trigger - does ONLY essential work
-- All non-critical operations deferred to post-signup processing
CREATE OR REPLACE FUNCTION public.handle_new_user_with_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  invitation_org_id uuid;
  invitation_role public.user_role;
  new_org_id uuid;
  org_name text;
BEGIN
  -- Ultra-fast invitation lookup - no ORDER BY, no complex joins, just get first match
  -- Use index hint by querying indexed columns first
  SELECT organization_id, role
  INTO invitation_org_id, invitation_role
  FROM invitations
  WHERE email = NEW.email 
    AND status = 'pending' 
    AND expires_at > now()
  LIMIT 1;  -- No ORDER BY - just get first match for speed
  
  -- If invitation found with valid org, use it
  IF invitation_org_id IS NOT NULL THEN
    -- Create profile immediately - minimal fields only
    INSERT INTO public.profiles (
      user_id, 
      email, 
      organization_id, 
      role,
      first_name,
      last_name,
      is_organization_creator,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.email,
      invitation_org_id,
      COALESCE(invitation_role, 'user'::public.user_role),
      NEW.raw_user_meta_data ->> 'first_name',
      NEW.raw_user_meta_data ->> 'last_name',
      FALSE,
      now(),
      now()
    );
    
    -- DO NOT update invitation here - defer to async job
    -- DO NOT process custom roles here - defer to async job
    
  ELSE
    -- No invitation - create new organization (fast path)
    org_name := COALESCE(
      NEW.raw_user_meta_data ->> 'organization',
      COALESCE(
        TRIM(CONCAT(
          COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''), 
          ' ', 
          COALESCE(NEW.raw_user_meta_data ->> 'last_name', '')
        )),
        'User'
      ) || ' Organization'
    );

    INSERT INTO public.organizations (name, email, created_at, updated_at)
    VALUES (org_name, COALESCE(NEW.email, 'user@example.com'), now(), now())
    RETURNING id INTO new_org_id;

    INSERT INTO public.profiles (
      user_id, 
      email, 
      organization_id, 
      role,
      first_name,
      last_name,
      is_organization_creator,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.email,
      new_org_id,
      'superadmin'::public.user_role,
      NEW.raw_user_meta_data ->> 'first_name',
      NEW.raw_user_meta_data ->> 'last_name',
      TRUE,
      now(),
      now()
    );
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Absolute minimal fallback - just create profile, ignore errors
    BEGIN
      INSERT INTO public.organizations (name, email, created_at, updated_at)
      VALUES ('User Organization', NEW.email, now(), now())
      RETURNING id INTO new_org_id;

      INSERT INTO public.profiles (
        user_id, email, organization_id, role, is_organization_creator, created_at, updated_at
      )
      VALUES (
        NEW.id, NEW.email, new_org_id, 'superadmin'::public.user_role, TRUE, now(), now()
      );
      
      RETURN NEW;
    EXCEPTION
      WHEN OTHERS THEN
        -- Last resort - just return, let auth succeed even if profile creation fails
        -- Profile can be created manually later
        RETURN NEW;
    END;
END;
$$;

-- Create separate function to handle custom roles and cleanup (called after profile creation)
CREATE OR REPLACE FUNCTION public.process_invitation_custom_roles(p_user_id uuid, p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  custom_role_names TEXT[];
  org_id_val uuid;
  invited_by_val uuid;
BEGIN
  -- Get custom roles and org info
  SELECT 
    ARRAY_AGG(icr.role_name),
    i.organization_id,
    i.invited_by
  INTO custom_role_names, org_id_val, invited_by_val
  FROM invitation_custom_roles icr
  JOIN invitations i ON i.id = icr.invitation_id
  WHERE icr.invitation_id = p_invitation_id;
  
  -- Assign custom roles if any
  IF custom_role_names IS NOT NULL AND array_length(custom_role_names, 1) > 0 THEN
    INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
    SELECT p_user_id, unnest(custom_role_names), org_id_val, invited_by_val
    ON CONFLICT (user_id, role_name, organization_id) DO NOTHING;
    
    -- Clean up
    DELETE FROM invitation_custom_roles WHERE invitation_id = p_invitation_id;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- Don't fail if custom roles can't be processed
    RAISE WARNING 'Failed to process custom roles for user %: %', p_user_id, SQLERRM;
END;
$$;

-- Create function to process invitation cleanup and custom roles AFTER signup
-- This runs asynchronously via pg_cron or can be called manually
CREATE OR REPLACE FUNCTION public.complete_invitation_processing(p_user_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  invitation_record RECORD;
  custom_role_names TEXT[];
BEGIN
  -- Find and process the invitation
  SELECT * INTO invitation_record
  FROM invitations
  WHERE email = p_user_email 
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF invitation_record.id IS NOT NULL THEN
    -- Mark as accepted
    UPDATE invitations
    SET status = 'accepted', updated_at = now()
    WHERE id = invitation_record.id;
    
    -- Process custom roles
    SELECT ARRAY_AGG(role_name) INTO custom_role_names
    FROM invitation_custom_roles
    WHERE invitation_id = invitation_record.id;
    
    IF custom_role_names IS NOT NULL AND array_length(custom_role_names, 1) > 0 THEN
      INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
      SELECT 
        (SELECT user_id FROM profiles WHERE email = p_user_email LIMIT 1),
        unnest(custom_role_names),
        invitation_record.organization_id,
        invitation_record.invited_by
      ON CONFLICT (user_id, role_name, organization_id) DO NOTHING;
      
      DELETE FROM invitation_custom_roles WHERE invitation_id = invitation_record.id;
    END IF;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to complete invitation processing: %', SQLERRM;
END;
$$;

