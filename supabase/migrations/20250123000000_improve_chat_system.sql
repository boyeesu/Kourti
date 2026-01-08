-- Migration: Improve chat system with triggers and real-time support
-- This migration adds triggers to automatically update conversation timestamps
-- and ensures real-time is properly configured

-- Function to update conversation updated_at when a message is inserted
CREATE OR REPLACE FUNCTION update_conversation_on_message_insert()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS trigger_update_conversation_on_message_insert ON public.messages;

-- Create trigger to update conversation timestamp when message is inserted
CREATE TRIGGER trigger_update_conversation_on_message_insert
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_message_insert();

-- Enable real-time for messages table (if not already enabled)
-- Note: This requires Supabase dashboard configuration, but we document it here
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Add comment
COMMENT ON FUNCTION update_conversation_on_message_insert() IS 'Automatically updates conversation updated_at when a message is inserted';
