-- Check if signups are actually creating users but failing on profile creation
-- This helps identify if the issue is with signup or with the trigger

-- Check users created in last hour
SELECT 
    'Recent Users' as check_type,
    u.id,
    u.email,
    u.created_at,
    u.raw_user_meta_data->>'first_name' as first_name,
    u.raw_user_meta_data->>'last_name' as last_name,
    CASE 
        WHEN p.id IS NOT NULL THEN '✅ Has profile'
        ELSE '❌ NO PROFILE (Trigger failed!)'
    END as profile_status,
    p.organization_id,
    p.role
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.user_id
WHERE u.created_at > now() - interval '1 hour'
ORDER BY u.created_at DESC
LIMIT 10;

-- Count users without profiles (trigger failures)
SELECT 
    'Trigger Failures' as check_type,
    COUNT(*) as users_without_profiles,
    STRING_AGG(u.email, ', ') as affected_emails
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.user_id
WHERE p.id IS NULL
AND u.created_at > now() - interval '1 hour';
