-- =============================================================================
-- ULTRA-MINIMAL SIGNUP FIX - FASTEST POSSIBLE TRIGGER
-- Run this in Supabase SQL Editor
-- =============================================================================

-- Step 1: Drop ALL triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user_trigger ON auth.users;
DROP TRIGGER IF EXISTS create_profile_trigger ON auth.users;

-- Step 2: Drop all old functions
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_with_invitation() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_minimal() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_signup() CASCADE;

-- Step 3: Ensure index exists for fast lookup
CREATE INDEX IF NOT EXISTS idx_invitations_email_pending 
  ON public.invitations(email) WHERE status = 'pending';

-- Step 4: Allow NULL organization_id in profiles
ALTER TABLE public.profiles ALTER COLUMN organization_id DROP NOT NULL;

-- Step 5: Create ULTRA-SIMPLE trigger - bare minimum work
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

  -- Create profile - ONE insert, that's it
  INSERT INTO profiles (user_id, email, organization_id, role, is_organization_creator, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
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
    INSERT INTO profiles (user_id, email, role, is_organization_creator, created_at, updated_at)
    VALUES (NEW.id, NEW.email, 'user', TRUE, now(), now())
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;

-- Step 6: Attach trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_fast();

-- Step 7: RLS policies for trigger
DROP POLICY IF EXISTS "Trigger can insert profiles" ON profiles;
CREATE POLICY "Trigger can insert profiles" ON profiles FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Trigger can update invitations" ON invitations;
CREATE POLICY "Trigger can update invitations" ON invitations FOR UPDATE WITH CHECK (true);

-- =============================================================================
-- FIX: Update Onboarding to create org and link profile
-- =============================================================================

-- This function is called from Onboarding page when user creates org
CREATE OR REPLACE FUNCTION public.complete_onboarding(
  p_org_name text,
  p_org_email text DEFAULT NULL,
  p_org_address text DEFAULT NULL,
  p_org_state text DEFAULT NULL,
  p_org_country text DEFAULT NULL,
  p_org_phone text DEFAULT NULL,
  p_org_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  new_org_id uuid;
  current_user_id uuid;
BEGIN
  -- Get current user
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Create organization
  INSERT INTO organizations (name, email, address, state, country, phone, description, created_at, updated_at)
  VALUES (p_org_name, p_org_email, p_org_address, p_org_state, p_org_country, p_org_phone, p_org_description, now(), now())
  RETURNING id INTO new_org_id;

  -- Link to profile
  UPDATE profiles
  SET organization_id = new_org_id, role = 'superadmin', updated_at = now()
  WHERE user_id = current_user_id;

  RETURN new_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_onboarding TO authenticated;

-- =============================================================================
-- VERIFY
-- =============================================================================
SELECT 
  'Trigger created' AS status,
  (SELECT COUNT(*) FROM pg_trigger WHERE tgname = 'on_auth_user_created') AS trigger_count;

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ SIGNUP FIX APPLIED';
  RAISE NOTICE '';
  RAISE NOTICE 'INVITED USERS:';
  RAISE NOTICE '  - Profile created with invitation org_id';
  RAISE NOTICE '  - AuthCallback sees org_id -> Dashboard (no onboarding)';
  RAISE NOTICE '';
  RAISE NOTICE 'NEW USERS:';
  RAISE NOTICE '  - Profile created with NULL org_id';
  RAISE NOTICE '  - AuthCallback sees NULL -> Onboarding';
  RAISE NOTICE '  - Onboarding creates org and links profile';
  RAISE NOTICE '';
  RAISE NOTICE 'RATE LIMITS - Fix in Dashboard:';
  RAISE NOTICE '  Settings > Authentication > Rate Limits';
  RAISE NOTICE '  - Increase signup rate to 10/min';
  RAISE NOTICE '';
END $$;
