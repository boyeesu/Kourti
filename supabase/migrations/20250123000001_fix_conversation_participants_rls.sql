-- Migration: Fix conversation_participants RLS policies
-- Issues:
-- 1. Missing UPDATE policy (needed for useMarkAsRead)
-- 2. Recursive SELECT policy causing performance issues and 500 errors
-- 3. Complex nested EXISTS checks causing infinite loops

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view participants in their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can add participants to their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can update their own participant record" ON public.conversation_participants;

-- Create optimized SELECT policy (NO RECURSION, NO FUNCTION CALLS)
-- Users can view participants if the conversation is in their organization
-- We check this by joining with profiles to get the user's org, then checking conversations
CREATE POLICY "Users can view participants in their conversations"
  ON public.conversation_participants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 
      FROM public.conversations c
      INNER JOIN public.profiles p ON p.organization_id = c.organization_id
      WHERE c.id = conversation_participants.conversation_id
      AND p.user_id = auth.uid()
    )
  );

-- Create INSERT policy (avoid function calls in WITH CHECK)
CREATE POLICY "Users can add participants to their conversations"
  ON public.conversation_participants
  FOR INSERT
  WITH CHECK (
    -- Conversation must exist and be in the user's organization
    EXISTS (
      SELECT 1 
      FROM public.conversations c
      INNER JOIN public.profiles p ON p.organization_id = c.organization_id
      WHERE c.id = conversation_participants.conversation_id
      AND p.user_id = auth.uid()
      AND (
        -- User created the conversation, OR
        c.created_by = auth.uid()
        OR
        -- User being added is in the same organization
        conversation_participants.user_id IN (
          SELECT user_id FROM public.profiles p2
          WHERE p2.organization_id = p.organization_id
        )
      )
    )
  );

-- Create UPDATE policy (needed for useMarkAsRead to update last_read_at)
-- Users can only update their own participant record
CREATE POLICY "Users can update their own participant record"
  ON public.conversation_participants
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Add index to improve SELECT policy performance
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_conv 
  ON public.conversation_participants(user_id, conversation_id);
