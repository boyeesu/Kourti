-- Migration: Add index on messages.conversation_id
-- Source: Query performance analysis - index_advisor recommendation
-- 
-- The query "SELECT ... FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC"
-- runs 11,807 times with 0.57ms mean. Index advisor confirms this index reduces query cost.

-- Composite index covers both the FK lookup AND the ORDER BY created_at DESC pattern
-- Single composite index is more efficient than two separate indexes
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created_at 
  ON public.messages(conversation_id, created_at DESC);

COMMENT ON INDEX public.idx_messages_conversation_id_created_at IS 'Composite index for conversation_id FK + created_at DESC ordering (query perf optimization)';
