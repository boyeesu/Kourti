-- 20260122000002_optimize_chat_queries.sql
-- PERFORMANCE FIX: Optimize chat queries to eliminate N+1 issues
-- This creates an RPC function that fetches all conversation data in a single query

-------------------------------------------------------------------------------
-- Create optimized function to get conversations with last message and unread count
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_conversations_optimized()
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  type text,
  name text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  participants jsonb,
  last_message jsonb,
  unread_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH user_conversations AS (
    -- Get conversation IDs where user is a participant
    SELECT
      cp.conversation_id,
      cp.last_read_at
    FROM public.conversation_participants cp
    WHERE cp.user_id = v_user_id
  ),
  last_messages AS (
    -- Get last message for each conversation using DISTINCT ON
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id,
      jsonb_build_object(
        'id', m.id,
        'content', m.content,
        'message_type', m.message_type,
        'sender_id', m.sender_id,
        'created_at', m.created_at,
        'metadata', m.metadata,
        'sender', jsonb_build_object(
          'id', p.user_id,
          'first_name', p.first_name,
          'last_name', p.last_name,
          'email', p.email
        )
      ) AS message_data
    FROM public.messages m
    LEFT JOIN public.profiles p ON p.user_id = m.sender_id
    WHERE m.conversation_id IN (SELECT conversation_id FROM user_conversations)
    ORDER BY m.conversation_id, m.created_at DESC
  ),
  unread_counts AS (
    -- Get unread count for each conversation
    SELECT
      m.conversation_id,
      COUNT(*) AS cnt
    FROM public.messages m
    JOIN user_conversations uc ON uc.conversation_id = m.conversation_id
    WHERE m.created_at > COALESCE(uc.last_read_at, '1970-01-01'::timestamptz)
      AND m.sender_id != v_user_id
    GROUP BY m.conversation_id
  ),
  conversation_participants_agg AS (
    -- Aggregate participants with profile info
    SELECT
      cp.conversation_id,
      jsonb_agg(
        jsonb_build_object(
          'user_id', cp.user_id,
          'last_read_at', cp.last_read_at,
          'first_name', p.first_name,
          'last_name', p.last_name,
          'email', p.email
        )
      ) AS participants_data
    FROM public.conversation_participants cp
    LEFT JOIN public.profiles p ON p.user_id = cp.user_id
    WHERE cp.conversation_id IN (SELECT conversation_id FROM user_conversations)
    GROUP BY cp.conversation_id
  )
  SELECT
    c.id,
    c.organization_id,
    c.type,
    c.name,
    c.created_by,
    c.created_at,
    c.updated_at,
    COALESCE(cpa.participants_data, '[]'::jsonb) AS participants,
    lm.message_data AS last_message,
    COALESCE(uc.cnt, 0) AS unread_count
  FROM public.conversations c
  JOIN user_conversations uconv ON uconv.conversation_id = c.id
  LEFT JOIN last_messages lm ON lm.conversation_id = c.id
  LEFT JOIN unread_counts uc ON uc.conversation_id = c.id
  LEFT JOIN conversation_participants_agg cpa ON cpa.conversation_id = c.id
  ORDER BY c.updated_at DESC;
END;
$$;

-- Add comment explaining the function
COMMENT ON FUNCTION public.get_user_conversations_optimized() IS
  'Fetches all conversations for the current user with last message, unread count, and participants in a single optimized query. Eliminates N+1 query issues.';

-------------------------------------------------------------------------------
-- Create index to optimize conversation queries if not exists
-------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_user
  ON public.conversation_participants(user_id, conversation_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_sender
  ON public.messages(conversation_id, sender_id, created_at);
