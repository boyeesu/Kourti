-- Fix security definer views by recreating them with SECURITY INVOKER

-- First, drop and recreate all_roles view with SECURITY INVOKER
DROP VIEW IF EXISTS public.all_roles;

CREATE VIEW public.all_roles 
WITH (security_invoker = true) 
AS
SELECT 
  role AS role_name,
  'global'::text AS role_type,
  role AS role_id,
  description,
  NULL::uuid AS organization_id,
  display_name
FROM public.global_roles
UNION ALL
SELECT 
  role_name,
  'custom'::text AS role_type,
  id::text AS role_id,
  description,
  organization_id,
  role_name AS display_name
FROM public.user_roles;

-- Drop and recreate organization_sso_configs_view with SECURITY INVOKER
DROP VIEW IF EXISTS public.organization_sso_configs_view;

CREATE VIEW public.organization_sso_configs_view
WITH (security_invoker = true)
AS
SELECT 
  id,
  organization_id,
  provider,
  client_id,
  CASE 
    WHEN client_secret IS NOT NULL THEN '********'::text 
    ELSE NULL 
  END AS client_secret_masked,
  client_secret IS NOT NULL AS has_client_secret,
  tenant_id,
  domain_hint,
  redirect_uri,
  is_enabled,
  created_at,
  created_by,
  updated_at,
  updated_by
FROM public.organization_sso_configs;