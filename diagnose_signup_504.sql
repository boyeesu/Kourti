-- =============================================================================
-- DIAGNOSTIC SCRIPT: Check current signup trigger and performance
-- =============================================================================
-- Run this in Supabase SQL Editor to see what's currently active
-- =============================================================================

-- 1. Check current trigger
SELECT 
  tgname AS trigger_name,
  tgrelid::regclass AS table_name,
  proname AS function_name,
  pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE tgrelid = 'auth.users'::regclass
  AND tgname = 'on_auth_user_created';

-- 2. Check current trigger function code
SELECT 
  proname AS function_name,
  prosrc AS function_body
FROM pg_proc
WHERE proname LIKE 'handle_new_user%'
ORDER BY proname;

-- 3. Check indexes on invitations table
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'invitations'
ORDER BY indexname;

-- 4. Check table sizes (to see if invitations table is large)
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  (SELECT COUNT(*) FROM public.invitations) AS invitations_count,
  (SELECT COUNT(*) FROM public.invitations WHERE status = 'pending' AND expires_at > now()) AS pending_invitations_count
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('invitations', 'profiles', 'organizations')
ORDER BY tablename;

-- 5. Check for slow queries in pg_stat_statements (if enabled)
SELECT 
  query,
  calls,
  mean_exec_time,
  max_exec_time,
  total_exec_time
FROM pg_stat_statements
WHERE query LIKE '%invitations%'
  OR query LIKE '%handle_new_user%'
ORDER BY mean_exec_time DESC
LIMIT 10;

-- 6. Test trigger execution time (simulated)
EXPLAIN ANALYZE
SELECT organization_id, role::text
FROM invitations
WHERE email = 'test@example.com'
  AND status = 'pending'
  AND expires_at > now()
ORDER BY created_at DESC
LIMIT 1;
