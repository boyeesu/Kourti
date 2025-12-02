-- Fix overly permissive RLS policies on role_permissions and settings tables
-- These policies had 'OR true' conditions that bypassed access controls

-- =====================
-- FIX role_permissions TABLE
-- =====================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can view role permissions or superadmins can manage all" ON public.role_permissions;

-- Create proper separated policies for role_permissions
-- All users in organization can VIEW role permissions (needed for UI to show permissions)
CREATE POLICY "Users can view role permissions in their organization"
ON public.role_permissions
FOR SELECT
USING (organization_id = get_current_user_organization_id());

-- Only superadmins can INSERT role permissions
CREATE POLICY "Superadmins can create role permissions"
ON public.role_permissions
FOR INSERT
WITH CHECK (
  organization_id = get_current_user_organization_id() 
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'superadmin'::user_role
  )
);

-- Only superadmins can UPDATE role permissions
CREATE POLICY "Superadmins can update role permissions"
ON public.role_permissions
FOR UPDATE
USING (
  organization_id = get_current_user_organization_id()
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'superadmin'::user_role
  )
);

-- Only superadmins can DELETE role permissions
CREATE POLICY "Superadmins can delete role permissions"
ON public.role_permissions
FOR DELETE
USING (
  organization_id = get_current_user_organization_id()
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'superadmin'::user_role
  )
);

-- =====================
-- FIX settings TABLE
-- =====================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can view settings or admins can manage all in their organ" ON public.settings;

-- Create proper separated policies for settings
-- All users in organization can VIEW settings
CREATE POLICY "Users can view settings in their organization"
ON public.settings
FOR SELECT
USING (organization_id = get_current_user_organization_id());

-- Only admins can INSERT settings
CREATE POLICY "Admins can create settings"
ON public.settings
FOR INSERT
WITH CHECK (
  organization_id = get_current_user_organization_id()
  AND is_user_admin()
);

-- Only admins can UPDATE settings
CREATE POLICY "Admins can update settings"
ON public.settings
FOR UPDATE
USING (
  organization_id = get_current_user_organization_id()
  AND is_user_admin()
);

-- Only admins can DELETE settings
CREATE POLICY "Admins can delete settings"
ON public.settings
FOR DELETE
USING (
  organization_id = get_current_user_organization_id()
  AND is_user_admin()
);