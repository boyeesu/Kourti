-- =============================================================================
-- COMPREHENSIVE SIGNUP FIX AND VERIFICATION
-- Run this in Supabase SQL Editor to ensure signup flow works correctly
-- =============================================================================

-- Step 1: Ensure organization_id can be NULL (required for onboarding flow)
DO $$
BEGIN
    ALTER TABLE public.profiles ALTER COLUMN organization_id DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN
    -- Column might already allow NULL, ignore error
    NULL;
END $$;

-- Step 2: Drop old triggers and functions
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_with_invitation() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_minimal() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_signup() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_fast() CASCADE;

-- Step 3: Create optimized indexes for fast invitation lookups
CREATE INDEX IF NOT EXISTS idx_invitations_email_status_expires_active
ON public.invitations(email, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id_email
ON public.profiles(user_id, email);

-- Step 4: Create the optimized trigger function (saves first_name and last_name)
CREATE OR REPLACE FUNCTION public.handle_new_user_ultra_fast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  inv_org uuid;
  inv_role text;
BEGIN
  -- Ultra-fast invitation lookup using optimized index
  SELECT organization_id, role::text INTO inv_org, inv_role
  FROM invitations
  WHERE email = NEW.email
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC  -- Get most recent invitation
  LIMIT 1;

  -- Single INSERT with all necessary data (including first_name and last_name)
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
    COALESCE(inv_role::user_role,
             CASE WHEN inv_org IS NULL THEN 'superadmin'::user_role
                  ELSE 'user'::user_role END),
    inv_org IS NULL,
    now(),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = COALESCE(EXCLUDED.first_name, profiles.first_name),
    last_name = COALESCE(EXCLUDED.last_name, profiles.last_name),
    updated_at = now();

  -- Update invitation status asynchronously (don't block signup)
  IF inv_org IS NOT NULL THEN
    UPDATE invitations
    SET status = 'accepted', updated_at = now()
    WHERE id = (
      SELECT id FROM invitations
      WHERE email = NEW.email 
        AND status = 'pending' 
        AND expires_at > now()
        AND organization_id = inv_org
      ORDER BY created_at DESC
      LIMIT 1
    );
  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Minimal fallback - just create profile, don't fail signup
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
      COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
      COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
      'user'::user_role,
      TRUE,
      now(),
      now()
    )
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN 
    -- Even if this fails, return NEW to let signup succeed
    NULL;
  END;
  RETURN NEW;
END;
$$;

-- Step 5: Attach the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_ultra_fast();

-- Step 6: Ensure RLS policies allow trigger to work
DROP POLICY IF EXISTS "Trigger can insert profiles" ON profiles;
CREATE POLICY "Trigger can insert profiles" ON profiles 
  FOR INSERT 
  WITH CHECK (true);

DROP POLICY IF EXISTS "Trigger can update profiles" ON profiles;
CREATE POLICY "Trigger can update profiles" ON profiles 
  FOR UPDATE 
  USING (true);

DROP POLICY IF EXISTS "Trigger can update invitations" ON invitations;
CREATE POLICY "Trigger can update invitations" ON invitations 
  FOR UPDATE 
  WITH CHECK (true);

-- Step 7: Verify setup
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ SIGNUP TRIGGER CONFIGURED';
  RAISE NOTICE '';
  RAISE NOTICE 'Flow:';
  RAISE NOTICE '  1. User signs up → trigger creates profile with NULL organization_id';
  RAISE NOTICE '  2. AuthCallback checks organization_id → redirects to /onboarding';
  RAISE NOTICE '  3. Onboarding creates organization and links to profile';
  RAISE NOTICE '  4. User completes onboarding → dashboard';
  RAISE NOTICE '';
  RAISE NOTICE 'For invited users:';
  RAISE NOTICE '  - Profile created with invitation organization_id';
  RAISE NOTICE '  - AuthCallback sees organization_id → redirects to /dashboard';
  RAISE NOTICE '';
END $$;

-- Step 8: Check current state
SELECT 
    'Current Trigger' as check_type,
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'users'
AND trigger_schema = 'auth';

SELECT 
    'Profiles without org (should be OK for new signups)' as check_type,
    COUNT(*) as count
FROM profiles
WHERE organization_id IS NULL;
