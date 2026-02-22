-- =============================================================================
-- APPLY TEMP PASSWORD INVITATION FLOW
-- Run this in Supabase SQL Editor to enable the new invitation flow
-- =============================================================================

-- Step 1: Add must_change_password flag to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- Step 2: Add temp_password_set to invitations (tracking)
ALTER TABLE public.invitations 
ADD COLUMN IF NOT EXISTS temp_password_set boolean DEFAULT false;

-- Step 3: Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_profiles_must_change_password 
  ON public.profiles(user_id) 
  WHERE must_change_password = true;

-- Step 4: Drop old trigger that was handling signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user_fast() CASCADE;
DROP FUNCTION IF EXISTS public.handle_self_registration() CASCADE;

-- Step 5: Create minimal trigger for self-registration only
-- Invited users are created via edge function, not through this trigger
CREATE OR REPLACE FUNCTION public.handle_self_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Skip if profile already exists (created by invitation flow)
  IF EXISTS (SELECT 1 FROM profiles WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Self-registration: create profile with NULL org (goes to onboarding)
  INSERT INTO profiles (user_id, email, organization_id, role, is_organization_creator, must_change_password, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    NULL,
    'superadmin',
    TRUE,
    FALSE,
    now(),
    now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_self_registration();

-- Step 6: Function to mark password as changed (called from frontend)
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

-- =============================================================================
-- DONE!
-- =============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ TEMP PASSWORD FLOW ENABLED';
  RAISE NOTICE '';
  RAISE NOTICE 'New invitation flow:';
  RAISE NOTICE '1. Admin clicks "Invite User"';
  RAISE NOTICE '2. System creates auth user with temp password';
  RAISE NOTICE '3. Email sent with credentials';
  RAISE NOTICE '4. User logs in with temp password';
  RAISE NOTICE '5. User forced to change password';
  RAISE NOTICE '6. User accesses dashboard';
  RAISE NOTICE '';
  RAISE NOTICE 'IMPORTANT: Deploy the edge function too!';
  RAISE NOTICE '  supabase functions deploy create-invited-user';
  RAISE NOTICE '';
END $$;
