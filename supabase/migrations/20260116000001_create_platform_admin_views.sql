-- Create views for platform admin with all KYC information
-- These views aggregate all onboarding/KYC data for easy access

-- View for organizations with all KYC data
CREATE OR REPLACE VIEW public.platform_admin_organizations AS
SELECT 
  o.id,
  o.name,
  o.type,
  o.email,
  o.description,
  o.address,
  o.state,
  o.country,
  o.phone,
  o.website,
  o.logo_url,
  o.is_active,
  o.created_at,
  o.updated_at,
  COUNT(DISTINCT p.user_id)::BIGINT as user_count,
  CASE 
    WHEN COALESCE(o.is_active, true) = false THEN 'disabled'
    WHEN COUNT(DISTINCT p.user_id) FILTER (WHERE p.status = 'active') > 0 THEN 'active'
    WHEN COUNT(DISTINCT p.user_id) = 0 THEN 'empty'
    ELSE 'inactive'
  END as status
FROM public.organizations o
LEFT JOIN public.profiles p ON p.organization_id = o.id
GROUP BY o.id, o.name, o.type, o.email, o.description, o.address, o.state, o.country, o.phone, o.website, o.logo_url, o.is_active, o.created_at, o.updated_at;

-- View for users with all KYC data
CREATE OR REPLACE VIEW public.platform_admin_users AS
SELECT 
  p.id,
  p.user_id,
  p.email,
  p.first_name,
  p.last_name,
  p.phone,
  p.role::TEXT as role,
  p.department,
  p.status,
  p.organization_id,
  o.name as organization_name,
  o.type as organization_type,
  p.created_at,
  p.updated_at,
  p.last_login_at,
  p.approved_at,
  p.approved_by,
  p.disabled_at,
  p.disabled_by
FROM public.profiles p
LEFT JOIN public.organizations o ON o.id = p.organization_id;

-- Grant access to platform admins only (via RLS or function)
-- Views are accessible through functions that check platform admin status

-- Update get_all_organizations to use the view and include KYC data
DROP FUNCTION IF EXISTS public.get_all_organizations();
CREATE OR REPLACE FUNCTION public.get_all_organizations()
RETURNS TABLE (
  id UUID,
  name TEXT,
  type TEXT,
  email TEXT,
  description TEXT,
  address TEXT,
  state TEXT,
  country TEXT,
  phone TEXT,
  website TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  user_count BIGINT,
  status TEXT,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can access all organizations';
  END IF;
  
  RETURN QUERY
  SELECT 
    v.id,
    v.name,
    v.type,
    v.email,
    v.description,
    v.address,
    v.state,
    v.country,
    v.phone,
    v.website,
    v.logo_url,
    v.created_at,
    v.updated_at,
    v.user_count,
    v.status,
    v.is_active
  FROM public.platform_admin_organizations v
  ORDER BY v.created_at DESC;
END;
$$;

-- Update get_all_users to use the view and include KYC data
DROP FUNCTION IF EXISTS public.get_all_users();
CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  role TEXT,
  department TEXT,
  status TEXT,
  organization_id UUID,
  organization_name TEXT,
  organization_type TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  disabled_at TIMESTAMPTZ,
  disabled_by UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can access all users';
  END IF;
  
  RETURN QUERY
  SELECT 
    v.id,
    v.user_id,
    v.email,
    v.first_name,
    v.last_name,
    v.phone,
    v.role,
    v.department,
    v.status,
    v.organization_id,
    v.organization_name,
    v.organization_type,
    v.created_at,
    v.updated_at,
    v.last_login_at,
    v.approved_at,
    v.approved_by,
    v.disabled_at,
    v.disabled_by
  FROM public.platform_admin_users v
  ORDER BY v.created_at DESC;
END;
$$;

-- Add comments
COMMENT ON VIEW public.platform_admin_organizations IS 'View for platform admins showing all organizations with complete KYC data';
COMMENT ON VIEW public.platform_admin_users IS 'View for platform admins showing all users with complete KYC data';
