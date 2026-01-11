-- Add platform_admin role to global_roles and create helper function
-- This role is for Kourti team and onboarding managers who need cross-org access

-- Add platform_admin to global_roles
INSERT INTO public.global_roles(role, display_name, description) VALUES
  ('platform_admin', 'Platform Admin', 'Kourti team member with cross-organization access and system-wide management capabilities')
ON CONFLICT (role) DO UPDATE SET 
  display_name = EXCLUDED.display_name, 
  description = EXCLUDED.description;

-- Create function to check if a user has platform_admin role
CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_role BOOLEAN := false;
BEGIN
  -- Check if user has platform_admin role in user_role_assignments
  SELECT EXISTS (
    SELECT 1
    FROM public.user_role_assignments ura
    JOIN public.profiles p ON p.user_id = ura.user_id
    WHERE ura.user_id = p_user_id
      AND ura.role_name = 'platform_admin'
      AND p.organization_id IS NOT NULL
  ) INTO v_has_role;
  
  RETURN COALESCE(v_has_role, false);
END;
$$;

-- Add comment
COMMENT ON FUNCTION public.is_platform_admin IS 'Checks if a user has the platform_admin role, granting cross-organization access';

-- Update profiles.status to include 'approved'
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS profiles_status_check;

ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_status_check 
CHECK (status IN ('active', 'disabled', 'pending', 'approved'));

-- Add approved_at and approved_by fields if they don't exist
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id);

-- Ensure last_login_at exists (it should from previous migration, but just in case)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
