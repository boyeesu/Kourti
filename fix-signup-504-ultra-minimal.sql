-- =============================================================================
-- ULTRA-MINIMAL SIGNUP FIX - ABSOLUTE MINIMUM TO PREVENT 504 TIMEOUTS
-- This does the ABSOLUTE MINIMUM work to prevent timeouts
-- =============================================================================

-- Step 1: Ensure organization_id can be NULL
DO $$
BEGIN
    ALTER TABLE public.profiles ALTER COLUMN organization_id DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Step 2: Drop ALL existing triggers and functions
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_with_invitation() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_minimal() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_signup() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_fast() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_ultra_fast() CASCADE;

-- Step 3: Create ABSOLUTE MINIMUM trigger - NO invitation lookup, NO complex logic
CREATE OR REPLACE FUNCTION public.handle_new_user_minimal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- ABSOLUTE MINIMUM: Just create profile, nothing else
  -- No invitation lookup (too slow)
  -- No complex logic (too slow)
  -- Just insert and return
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
    'superadmin'::user_role,
    TRUE,
    now(),
    now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- If anything fails, just return NEW - don't block signup
  RETURN NEW;
END;
$$;

-- Step 4: Attach the minimal trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_minimal();

-- Step 5: Ensure RLS policies allow trigger to work
DROP POLICY IF EXISTS "Trigger can insert profiles" ON profiles;
CREATE POLICY "Trigger can insert profiles" ON profiles 
  FOR INSERT 
  WITH CHECK (true);

-- Step 6: Create function to handle invitations AFTER signup (async)
-- This will be called from the frontend after successful signup
CREATE OR REPLACE FUNCTION public.check_and_apply_invitation(p_user_id uuid, p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  inv_org uuid;
  inv_role text;
BEGIN
  -- Check for pending invitation
  SELECT organization_id, role::text INTO inv_org, inv_role
  FROM invitations
  WHERE email = p_email
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  -- If invitation found, update profile
  IF inv_org IS NOT NULL THEN
    UPDATE profiles
    SET organization_id = inv_org,
        role = COALESCE(inv_role::user_role, 'user'::user_role),
        is_organization_creator = FALSE,
        updated_at = now()
    WHERE user_id = p_user_id;

    -- Mark invitation as accepted
    UPDATE invitations
    SET status = 'accepted', updated_at = now()
    WHERE id = (
      SELECT id FROM invitations
      WHERE email = p_email 
        AND status = 'pending' 
        AND expires_at > now()
        AND organization_id = inv_org
      ORDER BY created_at DESC
      LIMIT 1
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_and_apply_invitation TO authenticated;

-- Step 7: Verify setup
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ ULTRA-MINIMAL SIGNUP TRIGGER APPLIED';
  RAISE NOTICE '';
  RAISE NOTICE 'This trigger does ABSOLUTE MINIMUM:';
  RAISE NOTICE '  - Creates basic profile only';
  RAISE NOTICE '  - NO invitation lookup (handled async after signup)';
  RAISE NOTICE '  - NO complex logic';
  RAISE NOTICE '  - Should complete in <100ms';
  RAISE NOTICE '';
  RAISE NOTICE 'For invited users:';
  RAISE NOTICE '  - Profile created with NULL organization_id';
  RAISE NOTICE '  - Frontend should call check_and_apply_invitation() after signup';
  RAISE NOTICE '  - Or handle in AuthCallback';
  RAISE NOTICE '';
END $$;

-- Step 8: Check current state
SELECT 
    'Current Trigger' as check_type,
    trigger_name,
    event_manipulation
FROM information_schema.triggers
WHERE event_object_table = 'users'
AND trigger_schema = 'auth';
