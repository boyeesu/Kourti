-- Add status field to organizations table for enable/disable functionality
-- This allows platform admins to enable/disable organizations

-- Add status column if it doesn't exist
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_organizations_is_active ON public.organizations(is_active);

-- Create function to toggle organization status (platform admin only)
CREATE OR REPLACE FUNCTION public.toggle_organization_status(
  p_org_id UUID,
  p_is_active BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can toggle organization status';
  END IF;

  -- Update organization status
  UPDATE public.organizations
  SET is_active = p_is_active,
      updated_at = now()
  WHERE id = p_org_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Organization not found');
  END IF;

  RETURN json_build_object(
    'success', true,
    'message', CASE WHEN p_is_active THEN 'Organization enabled successfully' ELSE 'Organization disabled successfully' END
  );
END;
$$;

-- Grant execute permission to authenticated users (RLS will enforce platform admin check)
GRANT EXECUTE ON FUNCTION public.toggle_organization_status(UUID, BOOLEAN) TO authenticated;

-- Drop existing function first to change return type
DROP FUNCTION IF EXISTS public.get_all_organizations();

-- Recreate get_all_organizations function to include is_active status
CREATE FUNCTION public.get_all_organizations()
RETURNS TABLE (
  id UUID,
  name TEXT,
  email TEXT,
  description TEXT,
  address TEXT,
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
    o.id,
    o.name,
    o.email,
    o.description,
    o.address,
    o.phone,
    o.website,
    o.logo_url,
    o.created_at,
    o.updated_at,
    COUNT(DISTINCT p.user_id)::BIGINT as user_count,
    CASE 
      WHEN COALESCE(o.is_active, true) = false THEN 'disabled'
      WHEN COUNT(DISTINCT p.user_id) FILTER (WHERE p.status = 'active') > 0 THEN 'active'
      WHEN COUNT(DISTINCT p.user_id) = 0 THEN 'empty'
      ELSE 'inactive'
    END as status,
    COALESCE(o.is_active, true) as is_active
  FROM public.organizations o
  LEFT JOIN public.profiles p ON p.organization_id = o.id
  GROUP BY o.id, o.name, o.email, o.description, o.address, o.phone, o.website, o.logo_url, o.created_at, o.updated_at, o.is_active
  ORDER BY o.created_at DESC;
END;
$$;
