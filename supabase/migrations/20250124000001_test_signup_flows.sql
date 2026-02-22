-- Test scripts for signup flows
-- Run these in Supabase SQL Editor to test user invitation and signup

-- ============================================================================
-- SETUP: Create test organization and admin user
-- ============================================================================

-- Create a test organization
DO $$
DECLARE
  test_org_id uuid;
  test_admin_id uuid;
BEGIN
  -- Create test organization
  INSERT INTO public.organizations (name, email, created_at, updated_at)
  VALUES ('Test Organization', 'test@example.com', now(), now())
  RETURNING id INTO test_org_id;

  -- Get or create test admin user (assuming one exists in auth.users)
  SELECT id INTO test_admin_id
  FROM auth.users
  WHERE email = 'admin@test.com'
  LIMIT 1;

  -- If admin doesn't exist, you'll need to create it via signup first
  IF test_admin_id IS NULL THEN
    RAISE NOTICE 'Test admin user not found. Please create admin@test.com first via signup.';
  ELSE
    -- Create admin profile if it doesn't exist
    INSERT INTO public.profiles (
      user_id, 
      first_name, 
      last_name, 
      email, 
      organization_id, 
      role, 
      is_organization_creator,
      created_at,
      updated_at
    )
    VALUES (
      test_admin_id,
      'Test',
      'Admin',
      'admin@test.com',
      test_org_id,
      'superadmin'::public.user_role,
      TRUE,
      now(),
      now()
    )
    ON CONFLICT (user_id) DO NOTHING;

    RAISE NOTICE 'Test setup complete. Organization ID: %, Admin ID: %', test_org_id, test_admin_id;
  END IF;
END $$;

-- ============================================================================
-- TEST 1: Regular Signup (No Invitation)
-- ============================================================================

-- This test simulates a user signing up without an invitation
-- Expected: User gets their own organization and superadmin role

DO $$
DECLARE
  test_email text := 'newuser' || extract(epoch from now())::text || '@test.com';
  test_user_id uuid;
  test_org_id uuid;
  profile_count int;
BEGIN
  RAISE NOTICE '=== TEST 1: Regular Signup (No Invitation) ===';
  RAISE NOTICE 'Test email: %', test_email;
  
  -- Note: In real scenario, this would be done via Supabase Auth signup
  -- For testing, we'll simulate by checking what would happen
  
  -- Check if any pending invitations exist for this email
  SELECT COUNT(*) INTO profile_count
  FROM invitations
  WHERE email = test_email AND status = 'pending';
  
  IF profile_count = 0 THEN
    RAISE NOTICE '✓ No pending invitations found (expected)';
    RAISE NOTICE 'Expected behavior: User will create new organization';
  ELSE
    RAISE NOTICE '✗ Found pending invitations (unexpected)';
  END IF;
  
  RAISE NOTICE 'To complete this test:';
  RAISE NOTICE '1. Sign up with email: %', test_email;
  RAISE NOTICE '2. Verify a new organization was created';
  RAISE NOTICE '3. Verify user has superadmin role';
END $$;

-- ============================================================================
-- TEST 2: Create Invitation and Test Acceptance
-- ============================================================================

DO $$
DECLARE
  test_org_id uuid;
  test_admin_id uuid;
  test_invite_email text := 'invited' || extract(epoch from now())::text || '@test.com';
  invitation_id_val uuid;
BEGIN
  RAISE NOTICE '=== TEST 2: Create Invitation ===';
  
  -- Get test organization
  SELECT id INTO test_org_id
  FROM public.organizations
  WHERE name = 'Test Organization'
  LIMIT 1;
  
  -- Get test admin
  SELECT user_id INTO test_admin_id
  FROM public.profiles
  WHERE role = 'superadmin'
  LIMIT 1;
  
  IF test_org_id IS NULL OR test_admin_id IS NULL THEN
    RAISE NOTICE '✗ Test setup incomplete. Run setup section first.';
    RETURN;
  END IF;
  
  -- Create invitation
  INSERT INTO public.invitations (
    organization_id,
    email,
    first_name,
    last_name,
    role,
    department,
    invited_by,
    status,
    expires_at
  )
  VALUES (
    test_org_id,
    test_invite_email,
    'Invited',
    'User',
    'user'::public.user_role,
    'Legal',
    test_admin_id,
    'pending',
    now() + interval '14 days'
  )
  RETURNING id INTO invitation_id_val;
  
  RAISE NOTICE '✓ Invitation created';
  RAISE NOTICE '  Invitation ID: %', invitation_id_val;
  RAISE NOTICE '  Email: %', test_invite_email;
  RAISE NOTICE '  Organization ID: %', test_org_id;
  RAISE NOTICE '  Role: user';
  
  -- Verify invitation exists
  IF invitation_id_val IS NOT NULL THEN
    RAISE NOTICE '✓ Invitation verification passed';
  ELSE
    RAISE NOTICE '✗ Invitation creation failed';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE 'To test acceptance:';
  RAISE NOTICE '1. Sign up with email: %', test_invite_email;
  RAISE NOTICE '2. Verify user is added to organization: %', test_org_id;
  RAISE NOTICE '3. Verify user has role: user';
  RAISE NOTICE '4. Verify invitation status changed to: accepted';
END $$;

-- ============================================================================
-- TEST 3: Test Invitation with Custom Role
-- ============================================================================

DO $$
DECLARE
  test_org_id uuid;
  test_admin_id uuid;
  test_invite_email text := 'customrole' || extract(epoch from now())::text || '@test.com';
  invitation_id_val uuid;
  custom_role_name text := 'paralegal';
BEGIN
  RAISE NOTICE '=== TEST 3: Invitation with Custom Role ===';
  
  -- Get test organization
  SELECT id INTO test_org_id
  FROM public.organizations
  WHERE name = 'Test Organization'
  LIMIT 1;
  
  -- Get test admin
  SELECT user_id INTO test_admin_id
  FROM public.profiles
  WHERE role = 'superadmin'
  LIMIT 1;
  
  IF test_org_id IS NULL OR test_admin_id IS NULL THEN
    RAISE NOTICE '✗ Test setup incomplete. Run setup section first.';
    RETURN;
  END IF;
  
  -- Create invitation with custom role
  INSERT INTO public.invitations (
    organization_id,
    email,
    first_name,
    last_name,
    role,
    department,
    invited_by,
    status,
    expires_at
  )
  VALUES (
    test_org_id,
    test_invite_email,
    'Custom',
    'Role',
    'user'::public.user_role, -- Base role
    'Legal',
    test_admin_id,
    'pending',
    now() + interval '14 days'
  )
  RETURNING id INTO invitation_id_val;
  
  -- Add custom role
  INSERT INTO public.invitation_custom_roles (invitation_id, role_name)
  VALUES (invitation_id_val, custom_role_name);
  
  RAISE NOTICE '✓ Invitation with custom role created';
  RAISE NOTICE '  Invitation ID: %', invitation_id_val;
  RAISE NOTICE '  Email: %', test_invite_email;
  RAISE NOTICE '  Base Role: user';
  RAISE NOTICE '  Custom Role: %', custom_role_name;
  
  RAISE NOTICE '';
  RAISE NOTICE 'To test acceptance:';
  RAISE NOTICE '1. Sign up with email: %', test_invite_email;
  RAISE NOTICE '2. Verify user has base role: user';
  RAISE NOTICE '3. Verify user_role_assignments contains: %', custom_role_name;
END $$;

-- ============================================================================
-- TEST 4: Verify Profile Creation After Signup
-- ============================================================================

-- This function checks if a profile was created correctly
CREATE OR REPLACE FUNCTION test_verify_profile(
  p_email text,
  p_expected_org_id uuid DEFAULT NULL,
  p_expected_role public.user_role DEFAULT NULL
)
RETURNS TABLE (
  test_name text,
  passed boolean,
  message text
)
LANGUAGE plpgsql
AS $$
DECLARE
  profile_record RECORD;
  user_record RECORD;
BEGIN
  -- Get user from auth
  SELECT * INTO user_record
  FROM auth.users
  WHERE email = p_email
  LIMIT 1;
  
  IF user_record.id IS NULL THEN
    RETURN QUERY SELECT 'User exists in auth.users'::text, false, 'User not found'::text;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT 'User exists in auth.users'::text, true, 'User found'::text;
  
  -- Get profile
  SELECT * INTO profile_record
  FROM public.profiles
  WHERE user_id = user_record.id;
  
  IF profile_record.id IS NULL THEN
    RETURN QUERY SELECT 'Profile created'::text, false, 'Profile not found'::text;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT 'Profile created'::text, true, 'Profile found'::text;
  
  -- Check organization
  IF p_expected_org_id IS NOT NULL THEN
    IF profile_record.organization_id = p_expected_org_id THEN
      RETURN QUERY SELECT 'Correct organization'::text, true, format('Organization ID: %', profile_record.organization_id);
    ELSE
      RETURN QUERY SELECT 'Correct organization'::text, false, format('Expected: %, Got: %', p_expected_org_id, profile_record.organization_id);
    END IF;
  END IF;
  
  -- Check role
  IF p_expected_role IS NOT NULL THEN
    IF profile_record.role = p_expected_role THEN
      RETURN QUERY SELECT 'Correct role'::text, true, format('Role: %', profile_record.role);
    ELSE
      RETURN QUERY SELECT 'Correct role'::text, false, format('Expected: %, Got: %', p_expected_role, profile_record.role);
    END IF;
  END IF;
  
  -- Check invitation status
  IF EXISTS (
    SELECT 1 FROM invitations
    WHERE email = p_email AND status = 'accepted'
  ) THEN
    RETURN QUERY SELECT 'Invitation accepted'::text, true, 'Invitation marked as accepted'::text;
  ELSIF EXISTS (
    SELECT 1 FROM invitations
    WHERE email = p_email AND status = 'pending'
  ) THEN
    RETURN QUERY SELECT 'Invitation accepted'::text, false, 'Invitation still pending'::text;
  END IF;
END;
$$;

-- ============================================================================
-- TEST 5: Test Multiple Invitations (Should Use Most Recent)
-- ============================================================================

DO $$
DECLARE
  test_org_id uuid;
  test_admin_id uuid;
  test_email text := 'multiple' || extract(epoch from now())::text || '@test.com';
  old_invitation_id uuid;
  new_invitation_id uuid;
BEGIN
  RAISE NOTICE '=== TEST 5: Multiple Invitations (Most Recent) ===';
  
  -- Get test organization
  SELECT id INTO test_org_id
  FROM public.organizations
  WHERE name = 'Test Organization'
  LIMIT 1;
  
  -- Get test admin
  SELECT user_id INTO test_admin_id
  FROM public.profiles
  WHERE role = 'superadmin'
  LIMIT 1;
  
  IF test_org_id IS NULL OR test_admin_id IS NULL THEN
    RAISE NOTICE '✗ Test setup incomplete. Run setup section first.';
    RETURN;
  END IF;
  
  -- Create old invitation
  INSERT INTO public.invitations (
    organization_id, email, first_name, last_name, role, invited_by, status, expires_at
  )
  VALUES (
    test_org_id, test_email, 'Old', 'Invite', 'user'::public.user_role, test_admin_id, 'pending', now() + interval '14 days'
  )
  RETURNING id INTO old_invitation_id;
  
  -- Wait a moment (simulated)
  PERFORM pg_sleep(1);
  
  -- Create new invitation (should be used)
  INSERT INTO public.invitations (
    organization_id, email, first_name, last_name, role, invited_by, status, expires_at
  )
  VALUES (
    test_org_id, test_email, 'New', 'Invite', 'admin'::public.user_role, test_admin_id, 'pending', now() + interval '14 days'
  )
  RETURNING id INTO new_invitation_id;
  
  RAISE NOTICE '✓ Created two invitations';
  RAISE NOTICE '  Old invitation ID: % (role: user)', old_invitation_id;
  RAISE NOTICE '  New invitation ID: % (role: admin)', new_invitation_id;
  RAISE NOTICE '';
  RAISE NOTICE 'Expected: New invitation (admin role) should be used';
  RAISE NOTICE 'To test: Sign up with email: %', test_email;
END $$;

-- ============================================================================
-- TEST 6: Test Expired Invitation (Should Create New Org)
-- ============================================================================

DO $$
DECLARE
  test_org_id uuid;
  test_admin_id uuid;
  test_email text := 'expired' || extract(epoch from now())::text || '@test.com';
  invitation_id_val uuid;
BEGIN
  RAISE NOTICE '=== TEST 6: Expired Invitation ===';
  
  -- Get test organization
  SELECT id INTO test_org_id
  FROM public.organizations
  WHERE name = 'Test Organization'
  LIMIT 1;
  
  -- Get test admin
  SELECT user_id INTO test_admin_id
  FROM public.profiles
  WHERE role = 'superadmin'
  LIMIT 1;
  
  IF test_org_id IS NULL OR test_admin_id IS NULL THEN
    RAISE NOTICE '✗ Test setup incomplete. Run setup section first.';
    RETURN;
  END IF;
  
  -- Create expired invitation
  INSERT INTO public.invitations (
    organization_id, email, first_name, last_name, role, invited_by, status, expires_at
  )
  VALUES (
    test_org_id, test_email, 'Expired', 'User', 'user'::public.user_role, test_admin_id, 'pending', now() - interval '1 day'
  )
  RETURNING id INTO invitation_id_val;
  
  RAISE NOTICE '✓ Created expired invitation';
  RAISE NOTICE '  Invitation ID: %', invitation_id_val;
  RAISE NOTICE '  Expires at: %', now() - interval '1 day';
  RAISE NOTICE '';
  RAISE NOTICE 'Expected: User should create new organization (invitation expired)';
  RAISE NOTICE 'To test: Sign up with email: %', test_email;
END $$;

-- ============================================================================
-- TEST 7: Performance Test - Check Trigger Speed
-- ============================================================================

CREATE OR REPLACE FUNCTION test_trigger_performance()
RETURNS TABLE (
  test_name text,
  duration_ms numeric,
  passed boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
  start_time timestamp;
  end_time timestamp;
  duration numeric;
BEGIN
  -- Test invitation lookup speed
  start_time := clock_timestamp();
  
  PERFORM id FROM invitations
  WHERE email = 'test@example.com'
    AND status = 'pending'
    AND expires_at > now()
  LIMIT 1;
  
  end_time := clock_timestamp();
  duration := extract(epoch from (end_time - start_time)) * 1000;
  
  RETURN QUERY SELECT 
    'Invitation lookup'::text,
    duration,
    duration < 100; -- Should be under 100ms
  
  -- Test profile insert speed (simulated)
  start_time := clock_timestamp();
  
  -- Just check if we can access the table quickly
  PERFORM COUNT(*) FROM profiles LIMIT 1;
  
  end_time := clock_timestamp();
  duration := extract(epoch from (end_time - start_time)) * 1000;
  
  RETURN QUERY SELECT 
    'Profile table access'::text,
    duration,
    duration < 50; -- Should be under 50ms
END;
$$;

-- ============================================================================
-- TEST 8: Cleanup Test Data
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_test_data()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Delete test invitations
  DELETE FROM invitations
  WHERE email LIKE '%@test.com'
    OR email LIKE 'newuser%@test.com'
    OR email LIKE 'invited%@test.com'
    OR email LIKE 'customrole%@test.com'
    OR email LIKE 'multiple%@test.com'
    OR email LIKE 'expired%@test.com';
  
  -- Delete test custom roles
  DELETE FROM invitation_custom_roles
  WHERE invitation_id IN (
    SELECT id FROM invitations WHERE email LIKE '%@test.com'
  );
  
  RAISE NOTICE 'Test data cleaned up';
END;
$$;

-- ============================================================================
-- RUN ALL TESTS
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'SIGNUP FLOW TEST SUITE';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Run each test section above individually, or use:';
  RAISE NOTICE '';
  RAISE NOTICE 'To verify a profile after signup:';
  RAISE NOTICE '  SELECT * FROM test_verify_profile(''user@example.com'', org_id, ''user''::user_role);';
  RAISE NOTICE '';
  RAISE NOTICE 'To test performance:';
  RAISE NOTICE '  SELECT * FROM test_trigger_performance();';
  RAISE NOTICE '';
  RAISE NOTICE 'To cleanup test data:';
  RAISE NOTICE '  SELECT cleanup_test_data();';
  RAISE NOTICE '';
END $$;
