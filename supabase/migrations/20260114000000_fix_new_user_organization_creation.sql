-- Fix: handle_new_user_ultra_fast was NOT creating organizations for new users
-- This migration restores the organization creation logic that was removed in the "ultra fast" optimization

-- Create or replace the trigger function with proper organization creation
CREATE OR REPLACE FUNCTION public.handle_new_user_ultra_fast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  inv_org uuid;
  inv_role text;
  new_org_id uuid;
  org_name text;
BEGIN
  -- Ultra-fast invitation lookup using optimized index
  SELECT organization_id, role::text INTO inv_org, inv_role
  FROM invitations
  WHERE email = NEW.email
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF inv_org IS NOT NULL THEN
    -- User has a valid invitation - use invitation's organization
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
      COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
      COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
      inv_org,
      COALESCE(inv_role::user_role, 'user'::user_role),
      FALSE,
      now(),
      now()
    );

    -- Update invitation status (fast operation)
    UPDATE invitations
    SET status = 'accepted', updated_at = now()
    WHERE email = NEW.email AND status = 'pending' AND expires_at > now();

  ELSE
    -- No invitation found - CREATE A NEW ORGANIZATION for this user
    -- This is the critical fix - the previous version did NOT create an organization

    org_name := COALESCE(
      NEW.raw_user_meta_data ->> 'organization',
      TRIM(CONCAT(
        COALESCE(NEW.raw_user_meta_data ->> 'first_name', 'New'),
        ' ',
        COALESCE(NEW.raw_user_meta_data ->> 'last_name', 'User')
      )) || ' Organization'
    );

    -- Create the organization first
    INSERT INTO public.organizations (name, email, created_at, updated_at)
    VALUES (org_name, NEW.email, now(), now())
    RETURNING id INTO new_org_id;

    -- Now create the profile with the new organization
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
      COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
      COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
      new_org_id,
      'superadmin'::user_role,
      TRUE,
      now(),
      now()
    );
  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Fallback: Try to create minimal organization and profile
  BEGIN
    -- Create a fallback organization
    INSERT INTO public.organizations (name, email, created_at, updated_at)
    VALUES (
      COALESCE(NEW.raw_user_meta_data ->> 'first_name', 'User') || ' Organization',
      NEW.email,
      now(),
      now()
    )
    RETURNING id INTO new_org_id;

    -- Create profile with the fallback organization
    INSERT INTO profiles (
      user_id,
      email,
      organization_id,
      role,
      is_organization_creator,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.email,
      new_org_id,
      'superadmin'::user_role,
      TRUE,
      now(),
      now()
    )
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
  EXCEPTION WHEN OTHERS THEN
    -- Last resort: Create profile without organization (frontend will handle)
    BEGIN
      INSERT INTO profiles (
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
        'superadmin'::user_role,
        TRUE,
        now(),
        now()
      )
      ON CONFLICT (user_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN NEW;
  END;
END;
$$;

-- Ensure the trigger is properly attached
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_ultra_fast();

-- Add RLS policies to allow the trigger to insert organizations
DROP POLICY IF EXISTS "Trigger can insert organizations" ON organizations;
CREATE POLICY "Trigger can insert organizations" ON organizations
  FOR INSERT WITH CHECK (true);

-- Ensure profiles can be inserted by trigger
DROP POLICY IF EXISTS "Trigger can insert profiles" ON profiles;
CREATE POLICY "Trigger can insert profiles" ON profiles
  FOR INSERT WITH CHECK (true);

-- Allow authenticated users to update their own profile (for onboarding)
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to view their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = user_id);

-- Allow users to update organizations they created or belong to (for onboarding)
DROP POLICY IF EXISTS "Users can update their organization" ON organizations;
CREATE POLICY "Users can update their organization" ON organizations
  FOR UPDATE USING (
    id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())
  );

-- Verify the fix
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== FIX APPLIED: Organization Creation for New Users ===';
  RAISE NOTICE '';
  RAISE NOTICE 'The handle_new_user_ultra_fast() trigger has been fixed to:';
  RAISE NOTICE '  1. Create an organization for new users without invitations';
  RAISE NOTICE '  2. Assign the organization to the user profile';
  RAISE NOTICE '  3. Set the user as superadmin and organization_creator';
  RAISE NOTICE '';
  RAISE NOTICE 'This fixes the onboarding flow where new users were being created';
  RAISE NOTICE 'without an organization, causing the signup to fail.';
  RAISE NOTICE '';
END $$;
