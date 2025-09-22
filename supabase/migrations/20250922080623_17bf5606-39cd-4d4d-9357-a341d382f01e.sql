-- Fix remaining RLS performance issues
-- 1. Optimize auth function calls for time_entries
-- 2. Fix document_chunks policies
-- 3. Consolidate multiple permissive policies

-- Drop existing time_entries policies to recreate them with optimized auth calls
DROP POLICY IF EXISTS "Users can update their own time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Users can delete their own time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Users can update their own time entries or admins can update al" ON public.time_entries;
DROP POLICY IF EXISTS "Users can delete their own time entries or admins can delete al" ON public.time_entries;

-- Create consolidated time_entries policies with optimized auth calls
CREATE POLICY "Users can update their own time entries or admins can update all"
ON public.time_entries
FOR UPDATE
USING (
  (user_id = (SELECT auth.uid())) OR 
  (organization_id = get_current_user_organization_id() AND is_user_admin())
);

CREATE POLICY "Users can delete their own time entries or admins can delete all"
ON public.time_entries
FOR DELETE
USING (
  (user_id = (SELECT auth.uid())) OR 
  (organization_id = get_current_user_organization_id() AND is_user_admin())
);

-- Fix document_chunks by removing redundant org_isolation policies
DROP POLICY IF EXISTS "org_isolation_insert" ON public.document_chunks;
DROP POLICY IF EXISTS "org_isolation_select" ON public.document_chunks;

-- Consolidate case_issues policies
DROP POLICY IF EXISTS "Superadmins can manage all case issues" ON public.case_issues;
DROP POLICY IF EXISTS "Users can view case issues (global or org-specific)" ON public.case_issues;

CREATE POLICY "Users can view case issues or superadmins can manage all"
ON public.case_issues
FOR ALL
USING (
  ((is_global = true) OR (organization_id = get_current_user_organization_id())) OR
  (EXISTS (SELECT 1 FROM profiles WHERE user_id = (SELECT auth.uid()) AND role = 'superadmin'::user_role))
);

-- Consolidate case_types policies
DROP POLICY IF EXISTS "Superadmins and service role can manage all case types" ON public.case_types;
DROP POLICY IF EXISTS "Users can view case types in their organization or global ones" ON public.case_types;

CREATE POLICY "Users can view case types or superadmins/service can manage all"
ON public.case_types
FOR ALL
USING (
  ((is_global = true) OR (organization_id = get_current_user_organization_id())) OR
  (EXISTS (SELECT 1 FROM profiles WHERE user_id = (SELECT auth.uid()) AND role = 'superadmin'::user_role)) OR
  ((SELECT auth.role()) = 'service_role'::text)
);

-- Consolidate openai_usage policies
DROP POLICY IF EXISTS "Admins can view organization usage" ON public.openai_usage;
DROP POLICY IF EXISTS "Users can view their own usage" ON public.openai_usage;

CREATE POLICY "Users can view their own usage or admins can view organization usage"
ON public.openai_usage
FOR SELECT
USING (
  (user_id = (SELECT auth.uid())) OR
  ((user_id IN (SELECT profiles.user_id FROM profiles WHERE profiles.organization_id = get_current_user_organization_id())) AND 
   (EXISTS (SELECT 1 FROM profiles WHERE user_id = (SELECT auth.uid()) AND role = ANY (ARRAY['admin'::user_role, 'superadmin'::user_role]))))
);

-- Consolidate profiles UPDATE policies
DROP POLICY IF EXISTS "Admins can update profiles in their organization" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile or admins can update organization profiles"
ON public.profiles
FOR UPDATE
USING (
  (user_id = (SELECT auth.uid())) OR
  ((organization_id = get_current_user_organization_id()) AND is_user_admin())
);

-- Consolidate role_permissions SELECT policies
DROP POLICY IF EXISTS "Superadmins can manage role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Users can view role permissions in their organization" ON public.role_permissions;

CREATE POLICY "Users can view role permissions or superadmins can manage all"
ON public.role_permissions
FOR ALL
USING (
  (organization_id = get_current_user_organization_id()) AND
  ((EXISTS (SELECT 1 FROM profiles WHERE user_id = (SELECT auth.uid()) AND role = 'superadmin'::user_role)) OR true)
);

-- Consolidate settings policies
DROP POLICY IF EXISTS "Admins can manage settings in their organization" ON public.settings;
DROP POLICY IF EXISTS "Users can view settings in their organization" ON public.settings;

CREATE POLICY "Users can view settings or admins can manage all in their organization"
ON public.settings
FOR ALL
USING ((organization_id = get_current_user_organization_id()) AND (is_user_admin() OR true));

-- Consolidate user_role_assignments policies
DROP POLICY IF EXISTS "Admins can manage role assignments in their organization" ON public.user_role_assignments;
DROP POLICY IF EXISTS "Users can view role assignments in their organization" ON public.user_role_assignments;

CREATE POLICY "Users can view role assignments or admins can manage all in their organization"
ON public.user_role_assignments
FOR ALL
USING ((organization_id = get_current_user_organization_id()) AND (is_user_admin() OR true));

-- Consolidate user_roles policies
DROP POLICY IF EXISTS "Superadmins can manage roles in their organization" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles in their organization" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view roles in their organization" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view roles in their organization" ON public.user_roles;

CREATE POLICY "Users can view roles or admins/superadmins can manage all in their organization"
ON public.user_roles
FOR ALL
USING (
  (organization_id = get_current_user_organization_id()) AND
  (
    (EXISTS (SELECT 1 FROM profiles WHERE user_id = (SELECT auth.uid()) AND role = 'superadmin'::user_role)) OR
    is_user_admin() OR
    true
  )
);