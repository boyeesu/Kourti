-- SECURITY DEFINER Functions Audit Query
-- Run this in Supabase SQL Editor to find functions that need SET search_path

-- Find all SECURITY DEFINER functions without explicit SET search_path
SELECT 
  p.proname as function_name,
  n.nspname as schema_name,
  pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true  -- SECURITY DEFINER
  AND pg_get_functiondef(p.oid) NOT LIKE '%SET search_path%'
ORDER BY p.proname;

-- Count of functions needing fix
SELECT 
  COUNT(*) as functions_needing_fix
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND pg_get_functiondef(p.oid) NOT LIKE '%SET search_path%';

-- Alternative: Find functions with SET search_path = '' (most secure)
SELECT 
  p.proname as function_name,
  n.nspname as schema_name
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND pg_get_functiondef(p.oid) LIKE '%SET search_path = ''%'
ORDER BY p.proname;

-- Alternative: Find functions with SET search_path = 'public' (less secure but easier)
SELECT 
  p.proname as function_name,
  n.nspname as schema_name
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND pg_get_functiondef(p.oid) LIKE '%SET search_path = ''public''%'
ORDER BY p.proname;
