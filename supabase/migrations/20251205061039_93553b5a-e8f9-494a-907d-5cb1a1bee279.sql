-- Fix RLS performance issues: wrap auth.uid() in (select auth.uid()) 
-- and consolidate duplicate permissive policies

-- ============================================
-- FIX: role_permissions table
-- ============================================
DROP POLICY IF EXISTS "Superadmins can create role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Superadmins can update role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Superadmins can delete role permissions" ON public.role_permissions;

CREATE POLICY "Superadmins can create role permissions" ON public.role_permissions
FOR INSERT WITH CHECK (
  organization_id = get_current_user_organization_id() 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = (select auth.uid()) 
    AND profiles.role = 'superadmin'::user_role
  )
);

CREATE POLICY "Superadmins can update role permissions" ON public.role_permissions
FOR UPDATE USING (
  organization_id = get_current_user_organization_id() 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = (select auth.uid()) 
    AND profiles.role = 'superadmin'::user_role
  )
);

CREATE POLICY "Superadmins can delete role permissions" ON public.role_permissions
FOR DELETE USING (
  organization_id = get_current_user_organization_id() 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = (select auth.uid()) 
    AND profiles.role = 'superadmin'::user_role
  )
);

-- ============================================
-- FIX: organization_sso_configs - consolidate duplicate policies
-- ============================================
DROP POLICY IF EXISTS "Superadmins can manage SSO config" ON public.organization_sso_configs;
DROP POLICY IF EXISTS "Superadmins can manage SSO configs in their organization" ON public.organization_sso_configs;

CREATE POLICY "Superadmins can manage SSO configs" ON public.organization_sso_configs
FOR ALL USING (
  organization_id = get_current_user_organization_id()
  AND EXISTS (
    SELECT 1 FROM user_role_assignments ura
    WHERE ura.user_id = (select auth.uid())
    AND ura.role_name = 'superadmin'
    AND ura.organization_id = organization_sso_configs.organization_id
  )
) WITH CHECK (
  organization_id = get_current_user_organization_id()
  AND EXISTS (
    SELECT 1 FROM user_role_assignments ura
    WHERE ura.user_id = (select auth.uid())
    AND ura.role_name = 'superadmin'
    AND ura.organization_id = organization_sso_configs.organization_id
  )
);

-- ============================================
-- FIX: audit_logs table
-- ============================================
DROP POLICY IF EXISTS "Superadmins can view audit logs in their organization" ON public.audit_logs;

CREATE POLICY "Superadmins can view audit logs in their organization" ON public.audit_logs
FOR SELECT USING (
  organization_id = get_current_user_organization_id() 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = (select auth.uid()) 
    AND profiles.role = 'superadmin'::user_role
  )
);

-- ============================================
-- FIX: clients - consolidate duplicate policies
-- ============================================
DROP POLICY IF EXISTS "Admins can create clients" ON public.clients;
DROP POLICY IF EXISTS "Users can create clients in their organization" ON public.clients;
DROP POLICY IF EXISTS "Users can create clients they'll manage" ON public.clients;
DROP POLICY IF EXISTS "Users can delete clients in their organization" ON public.clients;
DROP POLICY IF EXISTS "Users can delete clients they manage" ON public.clients;
DROP POLICY IF EXISTS "Users can update clients in their organization" ON public.clients;
DROP POLICY IF EXISTS "Users can update clients they manage" ON public.clients;
DROP POLICY IF EXISTS "Users can view clients they're assigned to" ON public.clients;

-- Consolidated INSERT policy
CREATE POLICY "Users can create clients in their organization" ON public.clients
FOR INSERT WITH CHECK (
  organization_id = get_current_user_organization_id()
);

-- Consolidated DELETE policy
CREATE POLICY "Users can delete clients in their organization" ON public.clients
FOR DELETE USING (
  organization_id = get_current_user_organization_id()
  AND (
    is_user_admin() 
    OR created_by = (select auth.uid())
  )
);

-- Consolidated UPDATE policy
CREATE POLICY "Users can update clients in their organization" ON public.clients
FOR UPDATE USING (
  organization_id = get_current_user_organization_id()
  AND (
    is_user_admin() 
    OR created_by = (select auth.uid())
  )
);

-- Consolidated SELECT policy
CREATE POLICY "Users can view clients in their organization" ON public.clients
FOR SELECT USING (
  organization_id = get_current_user_organization_id()
  AND (
    is_user_admin() 
    OR created_by = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM cases
      WHERE cases.client_id = clients.id
      AND (cases.assigned_to = (select auth.uid()) OR cases.created_by = (select auth.uid()))
    )
  )
);

-- ============================================
-- FIX: ai_conversation_messages table
-- ============================================
DROP POLICY IF EXISTS "Users can create messages in their conversations" ON public.ai_conversation_messages;
DROP POLICY IF EXISTS "Users can delete messages in their conversations" ON public.ai_conversation_messages;
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.ai_conversation_messages;

CREATE POLICY "Users can create messages in their conversations" ON public.ai_conversation_messages
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM ai_conversations
    WHERE ai_conversations.id = ai_conversation_messages.conversation_id
    AND ai_conversations.user_id = (select auth.uid())
    AND ai_conversations.organization_id = get_current_user_organization_id()
  )
);

CREATE POLICY "Users can delete messages in their conversations" ON public.ai_conversation_messages
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM ai_conversations
    WHERE ai_conversations.id = ai_conversation_messages.conversation_id
    AND ai_conversations.user_id = (select auth.uid())
    AND ai_conversations.organization_id = get_current_user_organization_id()
  )
);

CREATE POLICY "Users can view messages in their conversations" ON public.ai_conversation_messages
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM ai_conversations
    WHERE ai_conversations.id = ai_conversation_messages.conversation_id
    AND ai_conversations.user_id = (select auth.uid())
    AND ai_conversations.organization_id = get_current_user_organization_id()
  )
);

-- ============================================
-- FIX: ai_conversations table
-- ============================================
DROP POLICY IF EXISTS "Users can create their own conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Users can delete their own conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Users can view their own conversations" ON public.ai_conversations;

CREATE POLICY "Users can create their own conversations" ON public.ai_conversations
FOR INSERT WITH CHECK (
  organization_id = get_current_user_organization_id() 
  AND user_id = (select auth.uid())
);

CREATE POLICY "Users can delete their own conversations" ON public.ai_conversations
FOR DELETE USING (
  organization_id = get_current_user_organization_id() 
  AND user_id = (select auth.uid())
);

CREATE POLICY "Users can update their own conversations" ON public.ai_conversations
FOR UPDATE USING (
  organization_id = get_current_user_organization_id() 
  AND user_id = (select auth.uid())
);

CREATE POLICY "Users can view their own conversations" ON public.ai_conversations
FOR SELECT USING (
  organization_id = get_current_user_organization_id() 
  AND user_id = (select auth.uid())
);

-- ============================================
-- FIX: user_role_assignments - consolidate duplicate SELECT policies
-- ============================================
DROP POLICY IF EXISTS "Only admins can manage role assignments" ON public.user_role_assignments;
DROP POLICY IF EXISTS "Users can view their own role assignments" ON public.user_role_assignments;

-- Create separate policies for different operations
CREATE POLICY "Admins can manage role assignments" ON public.user_role_assignments
FOR ALL USING (
  organization_id = get_current_user_organization_id() 
  AND is_user_admin()
) WITH CHECK (
  organization_id = get_current_user_organization_id() 
  AND is_user_admin()
);

CREATE POLICY "Users can view role assignments in their org" ON public.user_role_assignments
FOR SELECT USING (
  organization_id = get_current_user_organization_id()
);

-- ============================================
-- FIX: profiles - consolidate duplicate UPDATE policies
-- ============================================
DROP POLICY IF EXISTS "admins_can_update_any_profile" ON public.profiles;
DROP POLICY IF EXISTS "users_update_own_profile_no_role_change" ON public.profiles;

CREATE POLICY "Users can update profiles" ON public.profiles
FOR UPDATE USING (
  organization_id = get_current_user_organization_id()
  AND (
    is_user_admin()
    OR user_id = (select auth.uid())
  )
) WITH CHECK (
  organization_id = get_current_user_organization_id()
  AND (
    is_user_admin()
    OR (user_id = (select auth.uid()) AND role = (SELECT role FROM profiles WHERE user_id = (select auth.uid())))
  )
);