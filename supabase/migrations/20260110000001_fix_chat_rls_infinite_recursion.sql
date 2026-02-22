-- Migration: Fix infinite recursion in chat RLS policies
-- Root cause: conversations policy checks conversation_participants, 
-- which checks conversations again = infinite loop
-- Solution: Break the circular dependency by using direct organization checks
--
-- IMPORTANT: This migration MUST be applied to fix the 500 errors.
-- Run this in Supabase SQL Editor or via migration system.

-- ============================================
-- 1. DROP ALL EXISTING CHAT POLICIES
-- ============================================

-- Drop ALL conversation_participants policies (comprehensive cleanup)
-- Old policy names
DROP POLICY IF EXISTS "Users can view participants in their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can add participants to their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can update their own participant record" ON public.conversation_participants;
-- New policy names (in case migration was partially run)
DROP POLICY IF EXISTS "cp_select_policy" ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_insert_policy" ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_update_policy" ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_delete_policy" ON public.conversation_participants;
-- Drop any remaining policies (catch-all)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'conversation_participants'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.conversation_participants', r.policyname);
  END LOOP;
END $$;

-- Drop conversations policies (old names)
DROP POLICY IF EXISTS "Users can view conversations in their organization" ON public.conversations;
DROP POLICY IF EXISTS "Users can create conversations in their organization" ON public.conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON public.conversations;
-- Drop conversations policies (new names - in case migration was partially run)
DROP POLICY IF EXISTS "conv_select_policy" ON public.conversations;
DROP POLICY IF EXISTS "conv_insert_policy" ON public.conversations;
DROP POLICY IF EXISTS "conv_update_policy" ON public.conversations;

-- Drop messages policies (old names)
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages to their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.messages;
-- Drop messages policies (new names - in case migration was partially run)
DROP POLICY IF EXISTS "msg_select_policy" ON public.messages;
DROP POLICY IF EXISTS "msg_insert_policy" ON public.messages;
DROP POLICY IF EXISTS "msg_update_policy" ON public.messages;
DROP POLICY IF EXISTS "msg_delete_policy" ON public.messages;

-- ============================================
-- 2. CREATE HELPER FUNCTIONS (SECURITY DEFINER TO BYPASS RLS)
-- ============================================

-- This function safely gets the user's org without triggering RLS checks
CREATE OR REPLACE FUNCTION public.get_auth_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Function to check if conversation is in an organization (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_conversation_in_org(conv_id UUID, org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conv_id AND c.organization_id = org_id
  );
END;
$$;

-- Function to check if user is a participant (SECURITY DEFINER to bypass RLS)
-- Uses plpgsql to explicitly bypass RLS when querying conversation_participants
CREATE OR REPLACE FUNCTION public.is_conversation_participant(conv_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- SECURITY DEFINER bypasses RLS completely - this query will not trigger RLS policies
  RETURN EXISTS (
    SELECT 1 FROM public.conversation_participants 
    WHERE conversation_id = conv_id AND user_id = auth.uid()
  );
END;
$$;

-- ============================================
-- 3. RECREATE CONVERSATION_PARTICIPANTS POLICIES (NO RECURSION)
-- ============================================

-- SELECT: Users can only see their own participant records (direct check, no recursion)
CREATE POLICY "cp_select_policy"
  ON public.conversation_participants
  FOR SELECT
  USING (user_id = auth.uid());

-- INSERT: User must be in same org as conversation
CREATE POLICY "cp_insert_policy"
  ON public.conversation_participants
  FOR INSERT
  WITH CHECK (
    public.is_conversation_in_org(conversation_participants.conversation_id, public.get_auth_user_org_id())
  );

-- UPDATE: Only update your own record
CREATE POLICY "cp_update_policy"
  ON public.conversation_participants
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: Only delete your own record (leave conversation)
CREATE POLICY "cp_delete_policy"
  ON public.conversation_participants
  FOR DELETE
  USING (user_id = auth.uid());

-- ============================================
-- 4. RECREATE CONVERSATIONS POLICIES (NO RECURSION)
-- ============================================

-- SELECT: User is a participant (use function to avoid circular check)
CREATE POLICY "conv_select_policy"
  ON public.conversations
  FOR SELECT
  USING (
    organization_id = public.get_auth_user_org_id()
    AND public.is_conversation_participant(id)
  );

-- INSERT: User is in org and is the creator
CREATE POLICY "conv_insert_policy"
  ON public.conversations
  FOR INSERT
  WITH CHECK (
    organization_id = public.get_auth_user_org_id()
    AND created_by = auth.uid()
  );

-- UPDATE: User is creator
CREATE POLICY "conv_update_policy"
  ON public.conversations
  FOR UPDATE
  USING (
    organization_id = public.get_auth_user_org_id()
    AND created_by = auth.uid()
  );

-- ============================================
-- 5. RECREATE MESSAGES POLICIES (NO RECURSION)
-- ============================================

-- SELECT: User is participant in the conversation
CREATE POLICY "msg_select_policy"
  ON public.messages
  FOR SELECT
  USING (
    public.is_conversation_participant(conversation_id)
  );

-- INSERT: User is participant and is the sender
CREATE POLICY "msg_insert_policy"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_conversation_participant(conversation_id)
  );

-- UPDATE: Sender only
CREATE POLICY "msg_update_policy"
  ON public.messages
  FOR UPDATE
  USING (sender_id = auth.uid());

-- DELETE: Sender only
CREATE POLICY "msg_delete_policy"
  ON public.messages
  FOR DELETE
  USING (sender_id = auth.uid());

-- ============================================
-- 6. ADD/UPDATE INDEXES FOR PERFORMANCE
-- ============================================

-- Composite index for participant lookup (critical for performance)
CREATE INDEX IF NOT EXISTS idx_cp_user_conversation 
  ON public.conversation_participants(user_id, conversation_id);

-- Index for conversation org lookup
CREATE INDEX IF NOT EXISTS idx_conversations_org_id 
  ON public.conversations(organization_id);

-- Index for messages by conversation
CREATE INDEX IF NOT EXISTS idx_messages_conv_created 
  ON public.messages(conversation_id, created_at DESC);

-- ============================================
-- 7. GRANT EXECUTE ON FUNCTIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.get_auth_user_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_in_org(UUID, UUID) TO authenticated;
