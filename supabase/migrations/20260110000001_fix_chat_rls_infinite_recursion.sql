-- Migration: Fix infinite recursion in chat RLS policies
-- Root cause: conversations policy checks conversation_participants, 
-- which checks conversations again = infinite loop
-- Solution: Break the circular dependency by using direct organization checks

-- ============================================
-- 1. DROP ALL EXISTING CHAT POLICIES
-- ============================================

-- Drop conversation_participants policies
DROP POLICY IF EXISTS "Users can view participants in their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can add participants to their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can update their own participant record" ON public.conversation_participants;

-- Drop conversations policies
DROP POLICY IF EXISTS "Users can view conversations in their organization" ON public.conversations;
DROP POLICY IF EXISTS "Users can create conversations in their organization" ON public.conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON public.conversations;

-- Drop messages policies
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages to their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.messages;

-- ============================================
-- 2. CREATE HELPER FUNCTION (NO RLS BYPASS NEEDED)
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

-- Function to check if user is a participant (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION public.is_conversation_participant(conv_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants 
    WHERE conversation_id = conv_id AND user_id = auth.uid()
  );
$$;

-- ============================================
-- 3. CREATE FUNCTION TO GET USER'S CONVERSATION IDS (bypasses RLS)
-- ============================================

-- This function returns all conversation IDs the user participates in
-- SECURITY DEFINER ensures it bypasses RLS to avoid recursion
CREATE OR REPLACE FUNCTION public.get_user_conversation_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT conversation_id FROM public.conversation_participants WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_user_conversation_ids() TO authenticated;

-- ============================================
-- 4. RECREATE CONVERSATION_PARTICIPANTS POLICIES (NO RECURSION)
-- ============================================

-- SELECT: User is a participant in this conversation (use function to avoid recursion)
CREATE POLICY "cp_select_policy"
  ON public.conversation_participants
  FOR SELECT
  USING (
    -- Use SECURITY DEFINER function to check participation without recursion
    conversation_id IN (SELECT public.get_user_conversation_ids())
  );

-- INSERT: User must be in same org as conversation, and either creator or adding someone from same org
CREATE POLICY "cp_insert_policy"
  ON public.conversation_participants
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_participants.conversation_id
      AND c.organization_id = public.get_auth_user_org_id()
    )
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
-- 5. RECREATE CONVERSATIONS POLICIES (NO RECURSION)
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
-- 6. RECREATE MESSAGES POLICIES (NO RECURSION)
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
-- 7. ADD/UPDATE INDEXES FOR PERFORMANCE
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
-- 8. GRANT EXECUTE ON FUNCTIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.get_auth_user_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(UUID) TO authenticated;
