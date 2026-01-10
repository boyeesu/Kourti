-- Migration: Add reply_to_id column to messages table for quote/reply feature

-- Add reply_to_id column (nullable, references same table)
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL;

-- Create index for efficient lookups of replies
CREATE INDEX IF NOT EXISTS idx_messages_reply_to_id ON public.messages(reply_to_id) WHERE reply_to_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.messages.reply_to_id IS 'References the message being replied to (quoted message)';
