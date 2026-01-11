-- Verify the trigger function is the minimal version
SELECT 
    routine_name,
    routine_type,
    CASE 
        WHEN routine_definition LIKE '%handle_new_user_minimal%' THEN '✅ Minimal function'
        WHEN routine_definition LIKE '%invitation%' AND routine_definition LIKE '%SELECT%FROM invitations%' THEN '❌ Still has invitation lookup (SLOW)'
        ELSE '⚠️ Unknown function'
    END as status
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'handle_new_user_minimal';

-- Check if the function exists and what it does
SELECT 
    'Function Check' as check_type,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.routines 
            WHERE routine_schema = 'public' 
            AND routine_name = 'handle_new_user_minimal'
        ) THEN '✅ Function exists'
        ELSE '❌ Function missing'
    END as function_status,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.routines 
            WHERE routine_schema = 'public' 
            AND routine_name = 'check_and_apply_invitation'
        ) THEN '✅ Invitation handler exists'
        ELSE '❌ Invitation handler missing'
    END as invitation_handler_status;
