-- Debug signup error - check what's happening
-- Run this to see if there are any issues

-- 1. Check if trigger function exists and is correct
SELECT 
    'Trigger Function' as check_type,
    routine_name,
    CASE 
        WHEN routine_definition LIKE '%INSERT INTO profiles%' THEN '✅ Has profile insert'
        ELSE '❌ Missing profile insert'
    END as has_insert,
    CASE 
        WHEN routine_definition LIKE '%SELECT%FROM invitations%' THEN '❌ Still has invitation lookup (SLOW!)'
        ELSE '✅ No invitation lookup'
    END as has_invitation_lookup
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'handle_new_user_minimal';

-- 2. Check RLS policies on profiles
SELECT 
    'RLS Policy' as check_type,
    policyname,
    cmd,
    CASE 
        WHEN cmd = 'INSERT' AND with_check = 'true' THEN '✅ Allows insert'
        WHEN cmd = 'INSERT' THEN '⚠️ Check insert policy'
        ELSE 'N/A'
    END as insert_status
FROM pg_policies
WHERE tablename = 'profiles'
AND policyname LIKE '%Trigger%';

-- 3. Check if profiles table has any constraints that might block inserts
SELECT 
    'Table Constraints' as check_type,
    constraint_name,
    constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'public'
AND table_name = 'profiles'
AND constraint_type IN ('CHECK', 'NOT NULL');

-- 4. Check recent failed signups (users without profiles)
SELECT 
    'Failed Signups' as check_type,
    COUNT(*) as users_without_profiles,
    MAX(u.created_at) as most_recent
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.user_id
WHERE p.id IS NULL
AND u.created_at > now() - interval '1 hour';

-- 5. Check for any errors in the trigger function definition
SELECT 
    'Function Definition' as check_type,
    CASE 
        WHEN routine_definition LIKE '%EXCEPTION%' THEN '✅ Has error handling'
        ELSE '⚠️ No error handling'
    END as error_handling,
    CASE 
        WHEN routine_definition LIKE '%RETURN NEW%' THEN '✅ Returns NEW'
        ELSE '❌ Missing RETURN NEW'
    END as returns_new
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'handle_new_user_minimal';
