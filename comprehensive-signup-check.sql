-- Comprehensive check of signup setup
-- Run this to verify everything is working

-- 1. Verify trigger function exists and is minimal
SELECT 
    'Function Check' as check_type,
    routine_name,
    CASE 
        WHEN routine_definition LIKE '%INSERT INTO profiles%' THEN '✅ Has insert'
        ELSE '❌ Missing insert'
    END as has_insert,
    CASE 
        WHEN routine_definition LIKE '%SELECT%FROM invitations%' THEN '❌ Has invitation lookup (SLOW!)'
        ELSE '✅ No invitation lookup'
    END as invitation_check,
    CASE 
        WHEN routine_definition LIKE '%EXCEPTION%' THEN '✅ Has error handling'
        ELSE '⚠️ No error handling'
    END as error_handling
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'handle_new_user_minimal';

-- 2. Check RLS policies - critical for trigger to work
SELECT 
    'RLS Policies' as check_type,
    policyname,
    cmd,
    roles,
    CASE 
        WHEN cmd = 'INSERT' AND (with_check = 'true' OR with_check IS NULL) THEN '✅ Should allow insert'
        WHEN cmd = 'INSERT' THEN '⚠️ Check with_check clause'
        ELSE 'N/A'
    END as insert_status
FROM pg_policies
WHERE tablename = 'profiles'
AND (policyname LIKE '%Trigger%' OR policyname LIKE '%trigger%')
ORDER BY cmd;

-- 3. Check if there are any blocking policies
SELECT 
    'All RLS Policies' as check_type,
    COUNT(*) as total_policies,
    COUNT(CASE WHEN cmd = 'INSERT' THEN 1 END) as insert_policies,
    COUNT(CASE WHEN cmd = 'SELECT' THEN 1 END) as select_policies
FROM pg_policies
WHERE tablename = 'profiles';

-- 4. Test if we can insert as the trigger would (using service role context)
-- This simulates what SECURITY DEFINER does
DO $$
DECLARE
  test_result text;
BEGIN
  -- Try to insert like the trigger would
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
      gen_random_uuid(),
      'test-' || extract(epoch from now())::text || '@test.com',
      'Test',
      'User',
      'superadmin'::user_role,
      TRUE,
      now(),
      now()
    );
    
    test_result := '✅ Insert test PASSED';
    ROLLBACK; -- Don't actually save
  EXCEPTION WHEN OTHERS THEN
    test_result := '❌ Insert test FAILED: ' || SQLERRM;
  END;
  
  RAISE NOTICE '%', test_result;
END $$;

-- 5. Check for foreign key constraints that might cause issues
SELECT 
    'Foreign Keys' as check_type,
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_name = 'profiles'
AND kcu.column_name = 'user_id';

-- 6. Check recent signup attempts
SELECT 
    'Recent Signups' as check_type,
    COUNT(*) as total_users_last_hour,
    COUNT(p.id) as users_with_profiles,
    COUNT(*) - COUNT(p.id) as users_without_profiles
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.user_id
WHERE u.created_at > now() - interval '1 hour';
