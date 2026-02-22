-- Test the trigger function directly to see if it works
-- This simulates what happens when a user signs up

-- First, let's check if we can insert into profiles with the trigger's logic
DO $$
DECLARE
  test_user_id uuid := gen_random_uuid();
  test_email text := 'test-' || extract(epoch from now())::text || '@example.com';
  test_meta jsonb := '{"first_name": "Test", "last_name": "User"}'::jsonb;
BEGIN
  -- Simulate what the trigger does
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
    test_user_id,
    test_email,
    COALESCE(test_meta ->> 'first_name', ''),
    COALESCE(test_meta ->> 'last_name', ''),
    'superadmin'::user_role,
    TRUE,
    now(),
    now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RAISE NOTICE '✅ Direct insert test PASSED';
  RAISE NOTICE 'Test user_id: %', test_user_id;
  RAISE NOTICE 'Test email: %', test_email;

  -- Clean up
  DELETE FROM profiles WHERE user_id = test_user_id;
  RAISE NOTICE '✅ Test cleaned up';
  
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '❌ Direct insert test FAILED: %', SQLERRM;
  RAISE WARNING 'Error code: %', SQLSTATE;
END $$;

-- Check if there are any NOT NULL constraints that might block inserts
SELECT 
    'Column Constraints' as check_type,
    column_name,
    is_nullable,
    column_default,
    CASE 
        WHEN is_nullable = 'NO' AND column_default IS NULL THEN '❌ Required, no default'
        WHEN is_nullable = 'NO' THEN '⚠️ Required, has default'
        ELSE '✅ Optional'
    END as constraint_status
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'profiles'
AND column_name IN ('user_id', 'email', 'first_name', 'last_name', 'role', 'is_organization_creator')
ORDER BY column_name;
