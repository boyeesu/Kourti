-- Quick verification that trigger is set up correctly
-- Run this after applying fix-and-test-signup.sql

-- 1. Verify trigger exists
SELECT 
    'Trigger Status' as check_type,
    trigger_name,
    event_manipulation,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'users'
AND trigger_schema = 'auth'
AND trigger_name = 'on_auth_user_created';

-- 2. Verify function exists
SELECT 
    'Function Status' as check_type,
    routine_name,
    routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'handle_new_user_ultra_fast';

-- 3. Verify organization_id can be NULL
SELECT 
    'Schema Check' as check_type,
    column_name,
    is_nullable,
    CASE 
        WHEN is_nullable = 'YES' THEN '✅ Can be NULL'
        ELSE '❌ Must have value'
    END as status
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'profiles'
AND column_name = 'organization_id';

-- 4. Check RLS policies exist
SELECT 
    'RLS Policy' as check_type,
    policyname,
    cmd,
    CASE 
        WHEN cmd = 'INSERT' AND policyname LIKE '%Trigger%' THEN '✅ Insert policy exists'
        WHEN cmd = 'UPDATE' AND policyname LIKE '%Trigger%' THEN '✅ Update policy exists'
        ELSE '⚠️ Check policy'
    END as status
FROM pg_policies
WHERE tablename = 'profiles'
AND policyname LIKE '%Trigger%'
ORDER BY cmd;

-- 5. Summary
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'TRIGGER SETUP VERIFICATION';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'If all checks show ✅, you are ready to test signup!';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Go to http://localhost:5173/onboarding';
    RAISE NOTICE '2. Fill out the signup form';
    RAISE NOTICE '3. Complete onboarding';
    RAISE NOTICE '4. Run diagnostic query to verify user was created';
    RAISE NOTICE '';
END $$;
