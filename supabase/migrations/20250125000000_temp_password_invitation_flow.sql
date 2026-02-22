-- =============================================================================
-- TEMPORARY PASSWORD INVITATION FLOW
-- New invitation approach: Create user with temp password, user must change on first login
-- =============================================================================

-- Step 1: Add must_change_password flag to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- Step 2: Add temp_password_hash to invitations for verification (optional security)
ALTER TABLE public.invitations 
ADD COLUMN IF NOT EXISTS temp_password_set boolean DEFAULT false;

-- Step 3: Create index for quick lookup of users needing password change
CREATE INDEX IF NOT EXISTS idx_profiles_must_change_password 
  ON public.profiles(user_id) 
  WHERE must_change_password = true;

-- Step 4: Drop the old signup trigger - we're creating users directly now
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user_fast() CASCADE;

-- Step 5: Create a minimal trigger ONLY for non-invited signups (self-registration)
-- Invited users are created via edge function, not through signup
CREATE OR REPLACE FUNCTION public.handle_self_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Check if profile already exists (created by invitation flow)
  IF EXISTS (SELECT 1 FROM profiles WHERE user_id = NEW.id) THEN
    RETURN NEW;  -- Profile exists, skip
  END IF;

  -- Self-registration: create profile with NULL org (will go to onboarding)
  INSERT INTO profiles (user_id, email, organization_id, role, is_organization_creator, must_change_password, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    NULL,  -- No org yet - goes to onboarding
    'superadmin',
    TRUE,
    FALSE,  -- Self-registered users set their own password
    now(),
    now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;  -- Don't block auth on errors
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_self_registration();

-- Step 6: Function to mark password as changed
CREATE OR REPLACE FUNCTION public.mark_password_changed()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE profiles
  SET must_change_password = false, updated_at = now()
  WHERE user_id = auth.uid();
  
  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_password_changed() TO authenticated;

-- Step 7: RLS policy to allow users to see their own must_change_password status
-- (Already covered by existing "Users can view their own profile" policy)

-- =============================================================================
-- VERIFICATION
-- =============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ TEMP PASSWORD INVITATION FLOW MIGRATION COMPLETE';
  RAISE NOTICE '';
  RAISE NOTICE 'New columns added:';
  RAISE NOTICE '  - profiles.must_change_password (boolean)';
  RAISE NOTICE '  - invitations.temp_password_set (boolean)';
  RAISE NOTICE '';
  RAISE NOTICE 'New flow:';
  RAISE NOTICE '  1. Admin invites user';
  RAISE NOTICE '  2. Edge function creates auth user + profile with temp password';
  RAISE NOTICE '  3. Email sent with temp password';
  RAISE NOTICE '  4. User logs in with temp password';
  RAISE NOTICE '  5. App detects must_change_password = true';
  RAISE NOTICE '  6. User forced to change password';
  RAISE NOTICE '  7. mark_password_changed() called -> Dashboard';
  RAISE NOTICE '';
END $$;
