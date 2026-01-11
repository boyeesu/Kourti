-- Migration: Fix Auth RLS InitPlan and Duplicate Policies
-- Date: 2026-01-11
--
-- This migration fixes:
-- 1. auth_rls_initplan issues: auth.<function>() calls being re-evaluated for each row
--    Solution: Wrap with (select auth.<function>()) for single evaluation
-- 2. multiple_permissive_policies: Duplicate policies for same role/action
--    Solution: Consolidate into single policies
-- 3. duplicate_index: Identical indexes on tables
--    Solution: Drop duplicates, keep one

-- ============================================================================
-- SECTION 1: FIX conversation_participants TABLE
-- Issues:
--   - Auth initplan: 8 policies re-evaluating auth functions
--   - Multiple policies: 3 SELECT, 3 INSERT, 3 UPDATE, 2 DELETE policies
-- ============================================================================

-- Drop ALL existing policies to start fresh
DROP POLICY IF EXISTS "Users can view own participations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can view participants in their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_select_policy" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can insert participations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can add participants to their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_insert_policy" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can update own participations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can update their own participant record" ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_update_policy" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can delete own participations" ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_delete_policy" ON public.conversation_participants;

-- CREATE CONSOLIDATED POLICIES with (select auth.uid()) for performance

-- SELECT: User can view participants in conversations they are part of
CREATE POLICY "cp_select"
  ON public.conversation_participants
  FOR SELECT
  USING (
    -- User can see participants in conversations they participate in
    conversation_id IN (
      SELECT cp.conversation_id
      FROM public.conversation_participants cp
      WHERE cp.user_id = (select auth.uid())
    )
  );

-- INSERT: User can add participants to conversations in their org
CREATE POLICY "cp_insert"
  ON public.conversation_participants
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_participants.conversation_id
      AND c.organization_id = (select public.get_auth_user_org_id())
    )
  );

-- UPDATE: User can only update their own participant record
CREATE POLICY "cp_update"
  ON public.conversation_participants
  FOR UPDATE
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- DELETE: User can only delete their own participation (leave conversation)
CREATE POLICY "cp_delete"
  ON public.conversation_participants
  FOR DELETE
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- SECTION 2: FIX conversations TABLE
-- Issues:
--   - Auth initplan: conv_insert_policy, conv_update_policy
--   - Multiple policies: 2 SELECT, 2 INSERT, 2 UPDATE policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view conversations in their organization" ON public.conversations;
DROP POLICY IF EXISTS "conv_select_policy" ON public.conversations;
DROP POLICY IF EXISTS "Users can create conversations in their organization" ON public.conversations;
DROP POLICY IF EXISTS "conv_insert_policy" ON public.conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON public.conversations;
DROP POLICY IF EXISTS "conv_update_policy" ON public.conversations;

-- SELECT: User can view conversations in their org where they participate
CREATE POLICY "conv_select"
  ON public.conversations
  FOR SELECT
  USING (
    organization_id = (select public.get_auth_user_org_id())
    AND (select public.is_conversation_participant(id))
  );

-- INSERT: User can create conversations in their org
CREATE POLICY "conv_insert"
  ON public.conversations
  FOR INSERT
  WITH CHECK (
    organization_id = (select public.get_auth_user_org_id())
    AND created_by = (select auth.uid())
  );

-- UPDATE: Creator can update the conversation
CREATE POLICY "conv_update"
  ON public.conversations
  FOR UPDATE
  USING (
    organization_id = (select public.get_auth_user_org_id())
    AND created_by = (select auth.uid())
  );

-- ============================================================================
-- SECTION 3: FIX messages TABLE
-- Issues:
--   - Auth initplan: msg_insert_policy, msg_update_policy, msg_delete_policy
--   - Multiple policies: 2 SELECT, 2 INSERT, 2 UPDATE, 2 DELETE policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "msg_select_policy" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages to their conversations" ON public.messages;
DROP POLICY IF EXISTS "msg_insert_policy" ON public.messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;
DROP POLICY IF EXISTS "msg_update_policy" ON public.messages;
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.messages;
DROP POLICY IF EXISTS "msg_delete_policy" ON public.messages;

-- SELECT: User can view messages in conversations they participate in
CREATE POLICY "msg_select"
  ON public.messages
  FOR SELECT
  USING ((select public.is_conversation_participant(conversation_id)));

-- INSERT: User can send messages to conversations they participate in
CREATE POLICY "msg_insert"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    sender_id = (select auth.uid())
    AND (select public.is_conversation_participant(conversation_id))
  );

-- UPDATE: User can update their own messages
CREATE POLICY "msg_update"
  ON public.messages
  FOR UPDATE
  USING (sender_id = (select auth.uid()));

-- DELETE: User can delete their own messages
CREATE POLICY "msg_delete"
  ON public.messages
  FOR DELETE
  USING (sender_id = (select auth.uid()));

-- ============================================================================
-- SECTION 4: FIX profiles TABLE
-- Issues:
--   - Multiple policies: 2 SELECT, 3 UPDATE policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles in their organization" ON public.profiles;
DROP POLICY IF EXISTS "Trigger can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "self_update" ON public.profiles;

-- SELECT: User can view own profile or profiles in their organization
CREATE POLICY "profiles_select"
  ON public.profiles
  FOR SELECT
  USING (
    user_id = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- UPDATE: User can update their own profile
CREATE POLICY "profiles_update"
  ON public.profiles
  FOR UPDATE
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- ============================================================================
-- SECTION 5: FIX user_csrf_sessions TABLE
-- Issues:
--   - Multiple policies: 3 SELECT, 2 INSERT, 2 UPDATE, 2 DELETE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own CSRF tokens" ON public.user_csrf_sessions;
DROP POLICY IF EXISTS "Service role can manage all CSRF tokens" ON public.user_csrf_sessions;
DROP POLICY IF EXISTS "Service role can delete CSRF tokens" ON public.user_csrf_sessions;
DROP POLICY IF EXISTS "Service role can insert CSRF tokens" ON public.user_csrf_sessions;
DROP POLICY IF EXISTS "Service role can update CSRF tokens" ON public.user_csrf_sessions;
DROP POLICY IF EXISTS "Users and service role can view CSRF tokens" ON public.user_csrf_sessions;

-- SELECT: User can view their own tokens
CREATE POLICY "csrf_select"
  ON public.user_csrf_sessions
  FOR SELECT
  USING (user_id = (select auth.uid()));

-- Service role has full access for all operations
CREATE POLICY "csrf_service_role_all"
  ON public.user_csrf_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- SECTION 6: FIX organizations TABLE
-- Issues:
--   - Auth initplan: "Users can update their organization"
--   - Multiple policies: 2 UPDATE policies (Admins + Users)
-- ============================================================================

DROP POLICY IF EXISTS "Users can update their organization" ON public.organizations;
DROP POLICY IF EXISTS "Admins can update their organization" ON public.organizations;

-- UPDATE: User can update organizations they belong to
-- (Admins and regular users have same org update capability via membership)
CREATE POLICY "org_update"
  ON public.organizations
  FOR UPDATE
  USING (
    id IN (
      SELECT organization_id
      FROM public.profiles
      WHERE user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- SECTION 7: FIX admin_actions TABLE
-- Issues:
--   - Auth initplan: "Platform admins can view admin actions"
-- ============================================================================

DROP POLICY IF EXISTS "Platform admins can view admin actions" ON public.admin_actions;

-- Recreate with subselect for is_platform_admin
CREATE POLICY "admin_actions_select"
  ON public.admin_actions
  FOR SELECT
  USING ((select is_platform_admin((select auth.uid()))));

-- ============================================================================
-- SECTION 8: REMOVE DUPLICATE INDEXES
-- ============================================================================

-- conversation_participants: idx_conversation_participants_user_conv vs idx_cp_user_conversation
-- Keep idx_cp_user_conversation (shorter name, same columns)
DROP INDEX IF EXISTS public.idx_conversation_participants_user_conv;

-- conversations: idx_conversations_org vs idx_conversations_org_id
-- Keep idx_conversations_org_id (more explicit name)
DROP INDEX IF EXISTS public.idx_conversations_org;

-- messages: idx_messages_conv_created vs idx_messages_conversation vs idx_messages_conversation_id_created_at
-- Keep idx_messages_conversation_id_created_at (most explicit, includes both columns)
DROP INDEX IF EXISTS public.idx_messages_conv_created;
DROP INDEX IF EXISTS public.idx_messages_conversation;

-- ============================================================================
-- SECTION 9: UPDATE HELPER FUNCTIONS to use subselects internally
-- ============================================================================

-- Update get_auth_user_org_id to use subselect for auth.uid()
CREATE OR REPLACE FUNCTION public.get_auth_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.profiles
  WHERE user_id = (select auth.uid())
  LIMIT 1;
$$;

-- Update is_conversation_participant to use subselect for auth.uid()
CREATE OR REPLACE FUNCTION public.is_conversation_participant(conv_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = conv_id
    AND user_id = (select auth.uid())
  );
$$;

-- Update get_user_conversation_ids to use subselect for auth.uid()
CREATE OR REPLACE FUNCTION public.get_user_conversation_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT conversation_id
  FROM public.conversation_participants
  WHERE user_id = (select auth.uid());
$$;

-- ============================================================================
-- SECTION 10: VERIFY GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_auth_user_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_conversation_ids() TO authenticated;

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- This migration consolidates multiple permissive policies into single policies
-- and wraps all auth function calls in (select ...) for optimal performance.
--
-- Tables fixed:
--   - conversation_participants: 11 policies -> 4 policies
--   - conversations: 6 policies -> 3 policies
--   - messages: 8 policies -> 4 policies
--   - profiles: 5 policies -> 2 policies
--   - user_csrf_sessions: 6 policies -> 2 policies
--   - organizations: 2 UPDATE policies -> 1 policy
--   - admin_actions: 1 policy fixed for auth initplan
--
-- Indexes removed (duplicates):
--   - idx_conversation_participants_user_conv
--   - idx_conversations_org
--   - idx_messages_conv_created
--   - idx_messages_conversation
-- ============================================================================
