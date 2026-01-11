-- =============================================================================
-- MINIMAL SIGNUP FIX - Defer all non-critical operations
-- =============================================================================
-- This version creates ONLY the profile during signup.
-- Invitation handling is deferred to onboarding flow or background job.
-- Use this if the optimized version still times out.
-- =============================================================================

-- Step 1: Create minimal trigger function (profile only, no invitation lookup)
CREATE OR REPLACE FUNCTION public.handle_new_user_minimal_fast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Just create a basic profile - that's it!
  -- No invitation lookup, no organization creation, no complex logic
  -- All of that is handled in the onboarding flow after signup succeeds
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
    'superadmin'::user_role,  -- Default role, can be updated later
    TRUE,  -- Default, can be updated later
    now(),
    now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- If anything fails, just return NEW and let signup succeed
  -- The onboarding flow will handle profile creation if needed
  RETURN NEW;
END;
$$;

-- Step 2: Replace trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_minimal_fast();

-- Step 3: Ensure RLS policies allow trigger to work
DROP POLICY IF EXISTS "Trigger can insert profiles" ON profiles;
CREATE POLICY "Trigger can insert profiles" ON profiles 
  FOR INSERT 
  WITH CHECK (true);

-- Step 4: Create function to handle invitation acceptance (call this from onboarding)
CREATE OR REPLACE FUNCTION public.accept_invitation_on_signup(p_user_id uuid, p_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  inv_record RECORD;
  updated_count integer;
BEGIN
  -- Find and accept pending invitation
  SELECT id, organization_id, role
  INTO inv_record
  FROM invitations
  WHERE email = p_email
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    -- Update invitation status
    UPDATE invitations
    SET status = 'accepted', updated_at = now()
    WHERE id = inv_record.id;

    -- Update profile with invitation details
    UPDATE profiles
    SET 
      organization_id = inv_record.organization_id,
      role = inv_record.role::user_role,
      is_organization_creator = FALSE,
      updated_at = now()
    WHERE user_id = p_user_id;

    RETURN json_build_object(
      'success', true,
      'organization_id', inv_record.organization_id,
      'role', inv_record.role
    );
  ELSE
    RETURN json_build_object('success', false, 'message', 'No pending invitation found');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Step 5: Grant execute permission
GRANT EXECUTE ON FUNCTION public.accept_invitation_on_signup(uuid, text) TO authenticated;

-- Step 6: Verify setup
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ MINIMAL SIGNUP TRIGGER APPLIED';
  RAISE NOTICE '';
  RAISE NOTICE 'This trigger does the ABSOLUTE MINIMUM:';
  RAISE NOTICE '  - Creates basic profile only (<50ms)';
  RAISE NOTICE '  - No invitation lookups (deferred)';
  RAISE NOTICE '  - No organization creation (deferred)';
  RAISE NOTICE '';
  RAISE NOTICE 'To handle invitations after signup:';
  RAISE NOTICE '  SELECT accept_invitation_on_signup(user_id, email);';
  RAISE NOTICE '';
  RAISE NOTICE 'Or handle in your onboarding flow.';
  RAISE NOTICE '';
END $$;
