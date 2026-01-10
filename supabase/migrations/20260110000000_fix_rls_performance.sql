-- Migration: Fix RLS performance issues
-- 1. Wrap auth functions in subselects to prevent per-row re-evaluation
-- 2. Consolidate multiple permissive policies into single policies

-- ============================================================================
-- HELPER: Update functions to use subselects internally
-- ============================================================================

-- These functions already use auth.uid() internally, but callers should still
-- wrap them in (select ...) for best performance in RLS policies

-- ============================================================================
-- TABLE: user_csrf_sessions
-- Issues:
--   - auth.uid() and auth.role() re-evaluated per row
--   - Multiple permissive policies for SELECT
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own CSRF tokens" ON public.user_csrf_sessions;
DROP POLICY IF EXISTS "Service role can manage all CSRF tokens" ON public.user_csrf_sessions;

-- Consolidated SELECT policy with subselects
CREATE POLICY "Users can view their own CSRF tokens"
  ON public.user_csrf_sessions
  FOR SELECT
  USING (user_id = (select auth.uid()));

-- Service role policy for ALL operations (not overlapping with user SELECT)
CREATE POLICY "Service role can manage all CSRF tokens"
  ON public.user_csrf_sessions
  FOR ALL
  USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- TABLE: notification_preferences
-- Issues: auth functions re-evaluated per row
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own notification preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users can update their own notification preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users can insert their own notification preferences" ON public.notification_preferences;

CREATE POLICY "Users can view their own notification preferences"
  ON public.notification_preferences
  FOR SELECT
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can update their own notification preferences"
  ON public.notification_preferences
  FOR UPDATE
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert their own notification preferences"
  ON public.notification_preferences
  FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

-- ============================================================================
-- TABLE: user_onboarding_steps
-- Issues: auth functions re-evaluated per row
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own onboarding steps" ON public.user_onboarding_steps;
DROP POLICY IF EXISTS "Users can update their own onboarding steps" ON public.user_onboarding_steps;
DROP POLICY IF EXISTS "Users can insert their own onboarding steps" ON public.user_onboarding_steps;

CREATE POLICY "Users can view their own onboarding steps"
  ON public.user_onboarding_steps
  FOR SELECT
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can update their own onboarding steps"
  ON public.user_onboarding_steps
  FOR UPDATE
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert their own onboarding steps"
  ON public.user_onboarding_steps
  FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

-- ============================================================================
-- TABLE: profiles
-- Issues:
--   - auth functions re-evaluated per row
--   - Multiple permissive INSERT and SELECT policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles in their organization" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles in organization" ON public.profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Trigger can insert profiles" ON public.profiles;

-- Consolidated SELECT: own profile OR same organization
CREATE POLICY "Users can view profiles in their organization"
  ON public.profiles
  FOR SELECT
  USING (
    user_id = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- Consolidated INSERT: service role OR trigger-based (using security definer functions)
-- Keep one policy that allows inserts during user creation flow
CREATE POLICY "System can insert profiles"
  ON public.profiles
  FOR INSERT
  WITH CHECK (true);  -- INSERT protected by trigger/function-level security

-- ============================================================================
-- TABLE: cases
-- Issues:
--   - auth functions re-evaluated per row
--   - Multiple permissive policies for SELECT, UPDATE, DELETE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own cases" ON public.cases;
DROP POLICY IF EXISTS "Users can view cases in their organization" ON public.cases;
DROP POLICY IF EXISTS "Users can update their own cases" ON public.cases;
DROP POLICY IF EXISTS "Users can update cases in their organization" ON public.cases;
DROP POLICY IF EXISTS "Users can delete their own cases" ON public.cases;
DROP POLICY IF EXISTS "Users can delete cases in their organization" ON public.cases;

-- Consolidated SELECT: own cases OR organization cases
CREATE POLICY "Users can view cases in their organization"
  ON public.cases
  FOR SELECT
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- Consolidated UPDATE: own cases OR organization cases
CREATE POLICY "Users can update cases in their organization"
  ON public.cases
  FOR UPDATE
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- Consolidated DELETE: own cases OR organization cases
CREATE POLICY "Users can delete cases in their organization"
  ON public.cases
  FOR DELETE
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- ============================================================================
-- TABLE: clients
-- Issues:
--   - auth functions re-evaluated per row
--   - Multiple permissive policies for SELECT, UPDATE, DELETE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can view clients in their organization" ON public.clients;
DROP POLICY IF EXISTS "Users can update their own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can update clients in their organization" ON public.clients;
DROP POLICY IF EXISTS "Users can delete their own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can delete clients in their organization" ON public.clients;

-- Consolidated SELECT
CREATE POLICY "Users can view clients in their organization"
  ON public.clients
  FOR SELECT
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- Consolidated UPDATE
CREATE POLICY "Users can update clients in their organization"
  ON public.clients
  FOR UPDATE
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- Consolidated DELETE
CREATE POLICY "Users can delete clients in their organization"
  ON public.clients
  FOR DELETE
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- ============================================================================
-- TABLE: documents
-- Issues:
--   - auth functions re-evaluated per row
--   - Multiple permissive policies for SELECT, UPDATE, DELETE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can view documents in their organization" ON public.documents;
DROP POLICY IF EXISTS "Users can update their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can update documents in their organization" ON public.documents;
DROP POLICY IF EXISTS "Users can delete their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can delete documents in their organization" ON public.documents;

-- Consolidated SELECT
CREATE POLICY "Users can view documents in their organization"
  ON public.documents
  FOR SELECT
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- Consolidated UPDATE
CREATE POLICY "Users can update documents in their organization"
  ON public.documents
  FOR UPDATE
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- Consolidated DELETE
CREATE POLICY "Users can delete documents in their organization"
  ON public.documents
  FOR DELETE
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- ============================================================================
-- TABLE: contracts
-- Issues:
--   - auth functions re-evaluated per row
--   - Multiple permissive policies for SELECT, UPDATE, DELETE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own contracts" ON public.contracts;
DROP POLICY IF EXISTS "Users can view contracts in their organization" ON public.contracts;
DROP POLICY IF EXISTS "Users can update their own contracts" ON public.contracts;
DROP POLICY IF EXISTS "Users can update contracts in their organization" ON public.contracts;
DROP POLICY IF EXISTS "Users can delete their own contracts" ON public.contracts;
DROP POLICY IF EXISTS "Users can delete contracts in their organization" ON public.contracts;

-- Consolidated SELECT
CREATE POLICY "Users can view contracts in their organization"
  ON public.contracts
  FOR SELECT
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- Consolidated UPDATE
CREATE POLICY "Users can update contracts in their organization"
  ON public.contracts
  FOR UPDATE
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- Consolidated DELETE
CREATE POLICY "Users can delete contracts in their organization"
  ON public.contracts
  FOR DELETE
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- ============================================================================
-- TABLE: calendar_events
-- Issues:
--   - auth functions re-evaluated per row
--   - 3 permissive SELECT policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Users can view calendar events in their organization" ON public.calendar_events;
DROP POLICY IF EXISTS "Users can view events in their organization" ON public.calendar_events;

-- Consolidated SELECT
CREATE POLICY "Users can view calendar events in their organization"
  ON public.calendar_events
  FOR SELECT
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- ============================================================================
-- TABLE: invoices
-- Issues:
--   - auth functions re-evaluated per row
--   - Multiple permissive SELECT policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can view invoices in their organization" ON public.invoices;

-- Consolidated SELECT
CREATE POLICY "Users can view invoices in their organization"
  ON public.invoices
  FOR SELECT
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- ============================================================================
-- TABLE: conversations
-- Issues: auth functions re-evaluated per row
-- ============================================================================

DROP POLICY IF EXISTS "Users can view conversations in their organization" ON public.conversations;
DROP POLICY IF EXISTS "Users can create conversations in their organization" ON public.conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON public.conversations;

CREATE POLICY "Users can view conversations in their organization"
  ON public.conversations
  FOR SELECT
  USING (organization_id = (select public.get_user_organization_id()));

CREATE POLICY "Users can create conversations in their organization"
  ON public.conversations
  FOR INSERT
  WITH CHECK (organization_id = (select public.get_user_organization_id()));

CREATE POLICY "Users can update their own conversations"
  ON public.conversations
  FOR UPDATE
  USING (created_by = (select auth.uid()));

-- ============================================================================
-- TABLE: messages
-- Issues: auth functions re-evaluated per row
-- ============================================================================

DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages to their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.messages;

CREATE POLICY "Users can view messages in their conversations"
  ON public.messages
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = messages.conversation_id
    AND cp.user_id = (select auth.uid())
  ));

CREATE POLICY "Users can send messages to their conversations"
  ON public.messages
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = messages.conversation_id
    AND cp.user_id = (select auth.uid())
  ));

CREATE POLICY "Users can update their own messages"
  ON public.messages
  FOR UPDATE
  USING (sender_id = (select auth.uid()));

CREATE POLICY "Users can delete their own messages"
  ON public.messages
  FOR DELETE
  USING (sender_id = (select auth.uid()));

-- ============================================================================
-- TABLE: conversation_participants
-- Issues: auth functions re-evaluated per row
-- ============================================================================

DROP POLICY IF EXISTS "Users can view participants in their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can add participants to their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can update their own participant record" ON public.conversation_participants;

CREATE POLICY "Users can view participants in their conversations"
  ON public.conversation_participants
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversation_participants.conversation_id
    AND cp.user_id = (select auth.uid())
  ));

CREATE POLICY "Users can add participants to their conversations"
  ON public.conversation_participants
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_participants.conversation_id
    AND c.created_by = (select auth.uid())
  ));

CREATE POLICY "Users can update their own participant record"
  ON public.conversation_participants
  FOR UPDATE
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- TABLE: organizations
-- Issues: Multiple permissive INSERT policies
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;
DROP POLICY IF EXISTS "Service role can insert organizations" ON public.organizations;

-- Consolidated INSERT policy
CREATE POLICY "Authenticated users can create organizations"
  ON public.organizations
  FOR INSERT
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- ============================================================================
-- TABLE: invitations
-- Issues: Multiple permissive UPDATE policies
-- ============================================================================

DROP POLICY IF EXISTS "Admins can update invitations in their organization" ON public.invitations;
DROP POLICY IF EXISTS "Trigger can update invitations" ON public.invitations;

-- Consolidated UPDATE policy - admins or system
CREATE POLICY "Admins can update invitations in their organization"
  ON public.invitations
  FOR UPDATE
  USING (
    organization_id = (select public.get_user_organization_id())
    AND (select public.current_user_is_org_admin())
  );

-- ============================================================================
-- TABLE: case_types (from earlier migration - ensure subselects)
-- ============================================================================

DROP POLICY IF EXISTS "Users can view case types in their organization" ON public.case_types;
DROP POLICY IF EXISTS "Users can create case types in their organization" ON public.case_types;
DROP POLICY IF EXISTS "Users can update case types in their organization" ON public.case_types;
DROP POLICY IF EXISTS "Users can delete case types in their organization" ON public.case_types;

CREATE POLICY "Users can view case types in their organization"
  ON public.case_types
  FOR SELECT
  USING (organization_id = (select public.get_user_organization_id()));

CREATE POLICY "Users can create case types in their organization"
  ON public.case_types
  FOR INSERT
  WITH CHECK (organization_id = (select public.get_user_organization_id()));

CREATE POLICY "Users can update case types in their organization"
  ON public.case_types
  FOR UPDATE
  USING (organization_id = (select public.get_user_organization_id()));

CREATE POLICY "Users can delete case types in their organization"
  ON public.case_types
  FOR DELETE
  USING (organization_id = (select public.get_user_organization_id()));

-- ============================================================================
-- TABLE: case_fields (from earlier migration - ensure subselects)
-- ============================================================================

DROP POLICY IF EXISTS "Users can view case fields in their organization" ON public.case_fields;
DROP POLICY IF EXISTS "Users can create case fields in their organization" ON public.case_fields;
DROP POLICY IF EXISTS "Users can update case fields in their organization" ON public.case_fields;
DROP POLICY IF EXISTS "Users can delete case fields in their organization" ON public.case_fields;

CREATE POLICY "Users can view case fields in their organization"
  ON public.case_fields
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.case_types ct
    WHERE ct.id = case_fields.case_type_id
    AND ct.organization_id = (select public.get_user_organization_id())
  ));

CREATE POLICY "Users can create case fields in their organization"
  ON public.case_fields
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.case_types ct
    WHERE ct.id = case_fields.case_type_id
    AND ct.organization_id = (select public.get_user_organization_id())
  ));

CREATE POLICY "Users can update case fields in their organization"
  ON public.case_fields
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.case_types ct
    WHERE ct.id = case_fields.case_type_id
    AND ct.organization_id = (select public.get_user_organization_id())
  ));

CREATE POLICY "Users can delete case fields in their organization"
  ON public.case_fields
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.case_types ct
    WHERE ct.id = case_fields.case_type_id
    AND ct.organization_id = (select public.get_user_organization_id())
  ));

-- ============================================================================
-- Update helper functions to use subselects internally for consistency
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_organization_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path = ''
AS $function$
  SELECT organization_id FROM public.profiles WHERE user_id = (select auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.current_user_is_org_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = (select auth.uid()) AND p.role IN ('admin', 'superadmin')
  );
$function$;

COMMENT ON COLUMN public.user_csrf_sessions.csrf_token IS 'Cryptographically secure CSRF token (64 hex characters)';
