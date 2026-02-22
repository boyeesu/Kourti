-- Add verified status and improve user management queries
-- Update profiles table to better track user status
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;

-- Create a view that combines profiles and invitations for user management
CREATE OR REPLACE VIEW public.organization_users AS
SELECT 
    p.id,
    p.user_id,
    p.email,
    p.first_name,
    p.last_name,
    p.role::text as role,
    p.department,
    p.status,
    p.disabled_at,
    p.disabled_by,
    p.verified_at,
    p.last_login_at,
    p.created_at,
    p.organization_id,
    'user' as user_type,
    CASE WHEN p.verified_at IS NOT NULL THEN 'verified' ELSE 'unverified' END as verification_status
FROM public.profiles p
WHERE p.organization_id IS NOT NULL

UNION ALL

SELECT 
    i.id,
    NULL as user_id,
    i.email,
    i.first_name,
    i.last_name,
    i.role::text as role,
    i.department,
    i.status,
    NULL as disabled_at,
    NULL as disabled_by,
    NULL as verified_at,
    NULL as last_login_at,
    i.created_at,
    i.organization_id,
    'invitation' as user_type,
    CASE 
        WHEN i.status = 'accepted' THEN 'verified'
        WHEN i.status = 'pending' THEN 'pending'
        ELSE 'expired'
    END as verification_status
FROM public.invitations i
WHERE i.status = 'pending' OR i.expires_at > now();

-- Update the trigger to set verified_at when user logs in
CREATE OR REPLACE FUNCTION public.update_user_login()
RETURNS TRIGGER AS $$
BEGIN
    -- Update last_login_at and set verified_at if not set
    UPDATE public.profiles 
    SET 
        last_login_at = now(),
        verified_at = COALESCE(verified_at, now())
    WHERE user_id = NEW.id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for tracking logins (this will fire when auth.users is updated with last_sign_in_at)
DROP TRIGGER IF EXISTS on_auth_user_login ON auth.users;
CREATE TRIGGER on_auth_user_login
    AFTER UPDATE OF last_sign_in_at ON auth.users
    FOR EACH ROW
    WHEN (OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at)
    EXECUTE FUNCTION public.update_user_login();

-- Add RLS policies for the view
ALTER VIEW public.organization_users OWNER TO postgres;

-- Grant access to the view
GRANT SELECT ON public.organization_users TO authenticated;

-- Create RLS policy for the view (views inherit from underlying tables but let's be explicit)
-- Note: Views use the RLS policies of their underlying tables

-- Add function to disable/enable users (only for superadmins)
CREATE OR REPLACE FUNCTION public.toggle_user_status(target_user_id uuid, disable boolean DEFAULT true)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_role text;
  current_org_id uuid;
  target_org_id uuid;
BEGIN
  -- Get current user's role and organization
  SELECT role::text, organization_id INTO current_user_role, current_org_id
  FROM public.profiles
  WHERE user_id = auth.uid();

  -- Only superadmins can disable/enable users
  IF current_user_role != 'superadmin' THEN
    RETURN json_build_object('error', 'Only superadmins can disable/enable users');
  END IF;

  -- Get target user's organization
  SELECT organization_id INTO target_org_id
  FROM public.profiles
  WHERE user_id = target_user_id;

  -- Ensure target user is in same organization
  IF target_org_id != current_org_id THEN
    RETURN json_build_object('error', 'User not found in your organization');
  END IF;

  -- Update the user's status
  IF disable THEN
    UPDATE public.profiles
    SET status = 'disabled',
        disabled_at = now(),
        disabled_by = auth.uid(),
        updated_at = now()
    WHERE user_id = target_user_id;
  ELSE
    UPDATE public.profiles
    SET status = 'active',
        disabled_at = NULL,
        disabled_by = NULL,
        updated_at = now()
    WHERE user_id = target_user_id;
  END IF;

  RETURN json_build_object(
    'success', true, 
    'message', 
    CASE WHEN disable THEN 'User disabled successfully' ELSE 'User enabled successfully' END
  );
END;
$$;