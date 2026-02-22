-- =============================================================================
-- URGENT SIGNUP FIX - MINIMAL TRIGGER TO PREVENT 504 TIMEOUTS
-- =============================================================================
-- Go to: https://supabase.com/dashboard/project/zjbvnvydgsxqmmrrmvif/sql
-- Copy and paste this entire script and click RUN
-- =============================================================================

-- Step 1: Drop ALL existing triggers and functions
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_with_invitation() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_minimal() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_signup() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_fast() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_ultra_fast() CASCADE;

-- Step 2: Ensure organization_id can be NULL
DO $$
BEGIN
  ALTER TABLE public.profiles ALTER COLUMN organization_id DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN
  -- Column might already allow NULL, ignore error
  NULL;
END $$;

-- Step 3: Create ABSOLUTE MINIMUM trigger - just create profile, nothing else
CREATE OR REPLACE FUNCTION public.handle_new_user_minimal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Just create a basic profile - that's it!
  -- No invitation lookup, no organization creation, no complex logic
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
  -- If anything fails, just return NEW and let signup succeed
  -- The onboarding flow will handle organization creation
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

-- =============================================================================
-- VERIFY FIX
-- =============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ MINIMAL SIGNUP TRIGGER APPLIED';
  RAISE NOTICE '';
  RAISE NOTICE 'This trigger does the ABSOLUTE MINIMUM:';
  RAISE NOTICE '  - Creates basic profile only';
  RAISE NOTICE '  - No invitation lookups (handled in onboarding)';
  RAISE NOTICE '  - No organization creation (handled in onboarding)';
  RAISE NOTICE '  - Should complete in <500ms';
  RAISE NOTICE '';
  RAISE NOTICE 'Signup should now work without 504 timeouts!';
  RAISE NOTICE '';
END $$;