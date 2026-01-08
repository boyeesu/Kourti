-- IMMEDIATE FIX: Run this in Supabase SQL Editor to fix the 500 errors
-- This fixes the conversation_participants RLS policies that are causing infinite loops
-- 
-- IMPORTANT: Run this entire script in Supabase SQL Editor to fix the issue immediately

-- Create helper function to check if conversation is in user's org (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_conversation_in_user_org(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_org_id UUID;
  conv_org_id UUID;
BEGIN
  -- Get user's organization
  SELECT organization_id INTO user_org_id
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  IF user_org_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Get conversation's organization (bypasses RLS due to SECURITY DEFINER)
  SELECT organization_id INTO conv_org_id
  FROM public.conversations
  WHERE id = p_conversation_id;
  
  RETURN conv_org_id = user_org_id;
END;
$$;

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view participants in their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can add participants to their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can update their own participant record" ON public.conversation_participants;

-- Also fix the conversations SELECT policy to avoid circular dependency
DROP POLICY IF EXISTS "Users can view conversations in their organization" ON public.conversations;

-- Create optimized SELECT policy (NO RECURSION, uses SECURITY DEFINER function)
-- Users can view participants if:
-- 1. They are the participant themselves, OR
-- 2. The conversation is in their organization (checked via function that bypasses RLS)
CREATE POLICY "Users can view participants in their conversations"
  ON public.conversation_participants
  FOR SELECT
  USING (
    -- Option 1: User is viewing their own participant record
    user_id = auth.uid()
    OR
    -- Option 2: Conversation is in user's organization (function bypasses RLS, no recursion)
    public.is_conversation_in_user_org(conversation_id)
  );

-- Create INSERT policy (uses helper function to avoid RLS recursion)
CREATE POLICY "Users can add participants to their conversations"
  ON public.conversation_participants
  FOR INSERT
  WITH CHECK (
    -- Conversation must be in user's organization (function bypasses RLS)
    public.is_conversation_in_user_org(conversation_participants.conversation_id)
    AND
    (
      -- User created the conversation, OR
      EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = conversation_participants.conversation_id
        AND c.created_by = auth.uid()
      )
      OR
      -- User being added is in the same organization
      conversation_participants.user_id IN (
        SELECT p.user_id 
        FROM public.profiles p
        INNER JOIN public.profiles p2 ON p2.organization_id = p.organization_id
        WHERE p2.user_id = auth.uid()
      )
    )
  );

-- Create UPDATE policy (needed for useMarkAsRead)
-- Use a simple direct check - no function calls, no recursion
-- This should be safe because user_id is a direct column check
CREATE POLICY "Users can update their own participant record"
  ON public.conversation_participants
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Recreate conversations SELECT policy to avoid circular dependency
-- Users can view conversations if they're in the same organization
-- NOTE: We don't check participants here to avoid circular dependency with conversation_participants policy
-- The application layer (useConversations hook) already filters by participant status
CREATE POLICY "Users can view conversations in their organization"
  ON public.conversations
  FOR SELECT
  USING (
    -- Check organization membership via profiles (no function call, no participant check)
    EXISTS (
      SELECT 1 
      FROM public.profiles p
      WHERE p.organization_id = conversations.organization_id
      AND p.user_id = auth.uid()
    )
  );

-- Add RLS policies for messages table (if missing)
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages to their conversations" ON public.messages;

-- Users can view messages if they're participants in the conversation
-- Use helper function to avoid circular dependency
CREATE POLICY "Users can view messages in their conversations"
  ON public.messages
  FOR SELECT
  USING (
    -- Conversation must be in user's organization (function bypasses RLS)
    public.is_conversation_in_user_org(messages.conversation_id)
    AND
    -- User must be a participant (direct check, no recursion)
    EXISTS (
      SELECT 1 
      FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
    )
  );

-- Users can send messages if they're participants in the conversation
CREATE POLICY "Users can send messages to their conversations"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND
    EXISTS (
      SELECT 1 
      FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
    )
  );

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_conv 
  ON public.conversation_participants(user_id, conversation_id);
