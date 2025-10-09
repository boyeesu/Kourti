-- Fix Critical Security Issues: Privilege Escalation Vulnerabilities

-- =====================================================
-- 1. Fix user_role_assignments RLS policies
-- =====================================================

-- Drop the broken policies with "OR true" vulnerability
DROP POLICY IF EXISTS "Users can view role assignments or admins can manage all in their organization" ON public.user_role_assignments;
DROP POLICY IF EXISTS "Only admins can manage role assignments" ON public.user_role_assignments;

-- Create proper restrictive policies for user_role_assignments
CREATE POLICY "Only admins can manage role assignments"
ON public.user_role_assignments FOR ALL
USING (
  organization_id = get_current_user_organization_id() AND 
  is_user_admin()
);

CREATE POLICY "Users can view their own role assignments"
ON public.user_role_assignments FOR SELECT
USING (user_id = auth.uid());

-- =====================================================
-- 2. Fix profiles table RLS to prevent role self-modification
-- =====================================================

-- Drop the overly permissive policies
DROP POLICY IF EXISTS "Users can update their own profile or admins can update organiz" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile or admins can update organization profiles" ON public.profiles;

-- The policies "users_update_own_profile_no_role_change" and "admins_can_update_any_profile" 
-- already exist and are correct, so we don't need to recreate them

-- =====================================================
-- 3. Improve client data access policies
-- =====================================================

-- Drop the overly broad client access policy
DROP POLICY IF EXISTS "Users can view clients in their organization" ON public.clients;

-- Create more restrictive policy: only admins and assigned case users
CREATE POLICY "Users can view clients they're assigned to"
ON public.clients FOR SELECT
USING (
  organization_id = get_current_user_organization_id()
  AND (
    is_user_admin() 
    OR created_by = auth.uid()
    OR EXISTS(
      SELECT 1 FROM cases 
      WHERE cases.client_id = clients.id 
      AND (cases.assigned_to = auth.uid() OR cases.created_by = auth.uid())
    )
  )
);

-- Admins can still manage all clients in their org
CREATE POLICY "Admins can create clients"
ON public.clients FOR INSERT
WITH CHECK (
  organization_id = get_current_user_organization_id() AND
  is_user_admin()
);

CREATE POLICY "Users can create clients they'll manage"
ON public.clients FOR INSERT
WITH CHECK (
  organization_id = get_current_user_organization_id() AND
  created_by = auth.uid()
);

CREATE POLICY "Users can update clients they manage"
ON public.clients FOR UPDATE
USING (
  organization_id = get_current_user_organization_id()
  AND (
    is_user_admin()
    OR created_by = auth.uid()
  )
);

CREATE POLICY "Users can delete clients they manage"
ON public.clients FOR DELETE
USING (
  organization_id = get_current_user_organization_id()
  AND (
    is_user_admin()
    OR created_by = auth.uid()
  )
);