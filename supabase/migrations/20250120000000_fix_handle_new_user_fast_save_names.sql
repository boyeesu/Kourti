-- Fix handle_new_user_fast() to save first_name and last_name from metadata
-- This ensures data persistence even if this trigger is used instead of handle_new_user_with_invitation()

CREATE OR REPLACE FUNCTION public.handle_new_user_fast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  inv_org uuid;
  inv_role text;
BEGIN
  -- Single fast query for invitation
  SELECT organization_id, role::text INTO inv_org, inv_role
  FROM invitations
  WHERE email = NEW.email AND status = 'pending' AND expires_at > now()
  LIMIT 1;

  -- Create profile - include first_name and last_name from metadata
  INSERT INTO profiles (
    user_id, 
    email, 
    first_name,
    last_name,
    organization_id, 
    role, 
    is_organization_creator, 
    created_at, 
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    inv_org,  -- NULL if no invitation, org_id if invited
    COALESCE(inv_role::user_role, CASE WHEN inv_org IS NULL THEN 'superadmin' ELSE 'user' END::user_role),
    inv_org IS NULL,  -- is_organization_creator = TRUE only if no invitation
    now(),
    now()
  );

  -- Mark invitation accepted (if exists) - separate statement for speed
  IF inv_org IS NOT NULL THEN
    UPDATE invitations SET status = 'accepted' WHERE email = NEW.email AND status = 'pending';
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- If anything fails, just create basic profile and continue
  BEGIN
    INSERT INTO profiles (
      user_id, 
      email, 
      first_name,
      last_name,
      role, 
      is_organization_creator, 
      created_at, 
      updated_at
    )
    VALUES (
      NEW.id, 
      NEW.email,
      NEW.raw_user_meta_data ->> 'first_name',
      NEW.raw_user_meta_data ->> 'last_name',
      'user', 
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
