-- Diagnostic queries for signup flow troubleshooting
-- Run these to check system health and configuration

-- ============================================================================
-- 1. Check Trigger Function Exists and is Correct
-- ============================================================================

SELECT 
  'Trigger Function Check' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' 
        AND p.proname = 'handle_new_user_with_invitation'
    ) THEN '✓ Function exists'
    ELSE '✗ Function missing'
  END as status;

-- Check trigger is attached
SELECT 
  'Trigger Attachment' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'auth' 
        AND c.relname = 'users'
        AND t.tgname = 'on_auth_user_created'
    ) THEN '✓ Trigger attached'
    ELSE '✗ Trigger not attached'
  END as status;

-- ============================================================================
-- 2. Check Required Indexes
-- ============================================================================

SELECT 
  'Index Check' as check_name,
  indexname as index_name,
  CASE 
    WHEN indexname IS NOT NULL THEN '✓ Exists'
    ELSE '✗ Missing'
  END as status
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'invitations'
  AND (
    indexname LIKE '%email%status%' 
    OR indexname LIKE '%invitations_email%'
  )
LIMIT 1;

-- ============================================================================
-- 3. Check RLS Policies
-- ============================================================================

SELECT 
  'RLS Policy Check' as check_name,
  schemaname || '.' || tablename as table_name,
  policyname,
  CASE 
    WHEN policyname LIKE '%Service role%' THEN '✓ Service role policy exists'
    ELSE '? Check manually'
  END as status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'organizations')
  AND policyname LIKE '%Service role%';

-- ============================================================================
-- 4. Check Recent Signups
-- ============================================================================

SELECT 
  'Recent Signups' as check_name,
  u.email,
  u.created_at as user_created,
  p.created_at as profile_created,
  CASE 
    WHEN p.id IS NOT NULL THEN '✓ Profile created'
    ELSE '✗ Profile missing'
  END as status,
  o.name as organization_name,
  p.role,
  i.status as invitation_status
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
LEFT JOIN public.organizations o ON o.id = p.organization_id
LEFT JOIN public.invitations i ON i.email = u.email
WHERE u.created_at > now() - interval '24 hours'
ORDER BY u.created_at DESC
LIMIT 10;

-- ============================================================================
-- 5. Check Pending Invitations
-- ============================================================================

SELECT 
  'Pending Invitations' as check_name,
  COUNT(*) as count,
  CASE 
    WHEN COUNT(*) > 0 THEN '✓ Invitations found'
    ELSE 'No pending invitations'
  END as status
FROM public.invitations
WHERE status = 'pending'
  AND expires_at > now();

-- ============================================================================
-- 6. Check for Orphaned Profiles (users without organizations)
-- ============================================================================

SELECT 
  'Orphaned Profiles Check' as check_name,
  COUNT(*) as count,
  CASE 
    WHEN COUNT(*) = 0 THEN '✓ No orphaned profiles'
    ELSE '✗ Found orphaned profiles'
  END as status
FROM public.profiles
WHERE organization_id IS NULL;

-- ============================================================================
-- 7. Check Function Performance
-- ============================================================================

-- Test invitation lookup speed
DO $$
DECLARE
  start_time timestamp;
  end_time timestamp;
  duration_ms numeric;
BEGIN
  start_time := clock_timestamp();
  
  PERFORM id FROM public.invitations
  WHERE email = 'test@example.com'
    AND status = 'pending'
    AND expires_at > now()
  LIMIT 1;
  
  end_time := clock_timestamp();
  duration_ms := extract(epoch from (end_time - start_time)) * 1000;
  
  RAISE NOTICE 'Invitation lookup test: % ms', duration_ms;
  
  IF duration_ms > 100 THEN
    RAISE WARNING 'Slow invitation lookup detected: % ms (should be < 100ms)', duration_ms;
  END IF;
END $$;

-- ============================================================================
-- 8. Check Table Statistics
-- ============================================================================

SELECT 
  'Table Statistics' as check_name,
  schemaname || '.' || tablename as table_name,
  n_live_tup as row_count,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'organizations', 'invitations', 'invitation_custom_roles')
ORDER BY tablename;

-- ============================================================================
-- 9. Check for Errors in Recent Logs (if accessible)
-- ============================================================================

-- Note: This requires access to pg_stat_statements or log tables
-- Adjust based on your Supabase setup

SELECT 
  'Error Check' as check_name,
  'Check Supabase Dashboard > Logs for recent errors' as message;

-- ============================================================================
-- 10. Quick Health Check Summary
-- ============================================================================

DO $$
DECLARE
  func_exists boolean;
  trigger_exists boolean;
  index_exists boolean;
  service_policy_exists boolean;
  health_status text;
BEGIN
  -- Check function
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' 
      AND p.proname = 'handle_new_user_with_invitation'
  ) INTO func_exists;
  
  -- Check trigger
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth' 
      AND c.relname = 'users'
      AND t.tgname = 'on_auth_user_created'
  ) INTO trigger_exists;
  
  -- Check index
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'invitations'
      AND indexname LIKE '%email%status%'
  ) INTO index_exists;
  
  -- Check service policy
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname LIKE '%Service role%'
  ) INTO service_policy_exists;
  
  -- Determine health status
  IF func_exists AND trigger_exists AND index_exists AND service_policy_exists THEN
    health_status := '✓ HEALTHY - All checks passed';
  ELSE
    health_status := '✗ ISSUES DETECTED - Review individual checks above';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'SYSTEM HEALTH CHECK';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Function exists: %', CASE WHEN func_exists THEN '✓' ELSE '✗' END;
  RAISE NOTICE 'Trigger attached: %', CASE WHEN trigger_exists THEN '✓' ELSE '✗' END;
  RAISE NOTICE 'Index exists: %', CASE WHEN index_exists THEN '✓' ELSE '✗' END;
  RAISE NOTICE 'Service policy exists: %', CASE WHEN service_policy_exists THEN '✓' ELSE '✗' END;
  RAISE NOTICE '';
  RAISE NOTICE 'Overall Status: %', health_status;
  RAISE NOTICE '========================================';
END $$;
