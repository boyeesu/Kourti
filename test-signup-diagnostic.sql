-- Diagnostic script to check signup flow setup
-- Run this in Supabase SQL Editor to verify the current state

-- 1. Check current trigger on auth.users
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'users'
AND trigger_schema = 'auth';

-- 2. Check current trigger function
SELECT 
    routine_name,
    routine_type,
    routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name LIKE '%handle_new_user%'
ORDER BY routine_name;

-- 3. Check if organization_id can be NULL in profiles
SELECT 
    column_name,
    is_nullable,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'profiles'
AND column_name = 'organization_id';

-- 4. Check RLS policies on profiles
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;

-- 5. Check recent signups (last 5)
SELECT 
    u.id as user_id,
    u.email,
    u.created_at as user_created_at,
    p.id as profile_id,
    p.first_name,
    p.last_name,
    p.organization_id,
    p.role,
    p.is_organization_creator,
    o.name as organization_name,
    o.type as organization_type
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.user_id
LEFT JOIN organizations o ON p.organization_id = o.id
ORDER BY u.created_at DESC
LIMIT 5;

-- 6. Check for profiles without organizations (potential issue)
SELECT 
    COUNT(*) as profiles_without_org,
    COUNT(CASE WHEN created_at > now() - interval '24 hours' THEN 1 END) as recent_profiles_without_org
FROM profiles
WHERE organization_id IS NULL;

-- 7. Test trigger function exists and is callable
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.routines 
        WHERE routine_schema = 'public' 
        AND routine_name LIKE '%handle_new_user%'
    ) THEN
        RAISE NOTICE '✅ Trigger function exists';
    ELSE
        RAISE WARNING '❌ No handle_new_user function found!';
    END IF;
END $$;
