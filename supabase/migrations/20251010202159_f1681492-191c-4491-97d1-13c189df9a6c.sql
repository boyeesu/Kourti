-- Create conversations table to store chat history
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT fk_conversations_user FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE
);

-- Create conversation messages table
CREATE TABLE IF NOT EXISTS public.ai_conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_conversations_org_user ON public.ai_conversations(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated ON public.ai_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_conversation_messages_conv ON public.ai_conversation_messages(conversation_id, created_at);

-- Enable RLS
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversation_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for conversations
CREATE POLICY "Users can view their own conversations"
  ON public.ai_conversations
  FOR SELECT
  USING (organization_id = get_current_user_organization_id() AND user_id = auth.uid());

CREATE POLICY "Users can create their own conversations"
  ON public.ai_conversations
  FOR INSERT
  WITH CHECK (organization_id = get_current_user_organization_id() AND user_id = auth.uid());

CREATE POLICY "Users can update their own conversations"
  ON public.ai_conversations
  FOR UPDATE
  USING (organization_id = get_current_user_organization_id() AND user_id = auth.uid());

CREATE POLICY "Users can delete their own conversations"
  ON public.ai_conversations
  FOR DELETE
  USING (organization_id = get_current_user_organization_id() AND user_id = auth.uid());

-- RLS Policies for messages
CREATE POLICY "Users can view messages in their conversations"
  ON public.ai_conversation_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_conversations
      WHERE ai_conversations.id = ai_conversation_messages.conversation_id
        AND ai_conversations.user_id = auth.uid()
        AND ai_conversations.organization_id = get_current_user_organization_id()
    )
  );

CREATE POLICY "Users can create messages in their conversations"
  ON public.ai_conversation_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_conversations
      WHERE ai_conversations.id = ai_conversation_messages.conversation_id
        AND ai_conversations.user_id = auth.uid()
        AND ai_conversations.organization_id = get_current_user_organization_id()
    )
  );

CREATE POLICY "Users can delete messages in their conversations"
  ON public.ai_conversation_messages
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_conversations
      WHERE ai_conversations.id = ai_conversation_messages.conversation_id
        AND ai_conversations.user_id = auth.uid()
        AND ai_conversations.organization_id = get_current_user_organization_id()
    )
  );

-- Trigger to update conversation updated_at when messages are added
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.ai_conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_update_conversation_timestamp
  AFTER INSERT ON public.ai_conversation_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_timestamp();