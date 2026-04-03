import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { logError } from '@/lib/logger';
import { invokeNodeApi } from '@/lib/backendApi';

export interface AIConversation {
  id: string;
  organization_id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface AIMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

export function useAIConversations() {
  const queryClient = useQueryClient();

  // Fetch all conversations for the current user
  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['ai-conversations'],
    queryFn: async () => {
      return invokeNodeApi<AIConversation[]>('/api/v1/ai/conversations');
    },
  });

  // Create a new conversation
  const createConversation = useMutation({
    mutationFn: async (title: string) => {
      return invokeNodeApi<AIConversation>('/api/v1/ai/conversations', {
        method: 'POST',
        body: { title },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
    },
    onError: (error) => {
      toast.error('Error', { description: 'Failed to create conversation' });
      logError('Create conversation error', error);
    },
  });

  // Update conversation title
  const updateConversation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      await invokeNodeApi(`/api/v1/ai/conversations/${id}`, {
        method: 'PATCH',
        body: { title },
      });
      return;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
    },
  });

  // Delete a conversation
  const deleteConversation = useMutation({
    mutationFn: async (id: string) => {
      await invokeNodeApi(`/api/v1/ai/conversations/${id}`, {
        method: 'DELETE',
      });
      return;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
      toast.success('Conversation deleted', { description: 'The conversation has been removed' });
    },
    onError: (error) => {
      toast.error('Error', { description: 'Failed to delete conversation' });
      logError('Delete conversation error', error);
    },
  });

  return {
    conversations,
    isLoading,
    createConversation,
    updateConversation,
    deleteConversation,
  };
}

export function useConversationMessages(conversationId: string | null) {
  const queryClient = useQueryClient();

  // Fetch messages for a conversation
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['ai-conversation-messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      return invokeNodeApi<AIMessage[]>(`/api/v1/ai/conversations/${conversationId}/messages`);
    },
    enabled: !!conversationId,
  });

  // Save a message
  const saveMessage = useMutation({
    mutationFn: async ({
      conversationId,
      role,
      content,
    }: {
      conversationId: string;
      role: 'user' | 'assistant' | 'system';
      content: string;
    }) => {
      await invokeNodeApi(`/api/v1/ai/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: { role, content },
      });
      return;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['ai-conversation-messages', variables.conversationId],
      });
      queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
    },
    onError: (error) => {
      toast.error('Error', { description: 'Failed to save message' });
      logError('Save message error', error);
    },
  });

  // Delete all messages in a conversation (for clearing)
  const clearMessages = useMutation({
    mutationFn: async (conversationId: string) => {
      await invokeNodeApi(`/api/v1/ai/conversations/${conversationId}/messages`, {
        method: 'DELETE',
      });
      return;
    },
    onSuccess: (_, conversationId) => {
      queryClient.invalidateQueries({
        queryKey: ['ai-conversation-messages', conversationId],
      });
    },
  });

  return {
    messages,
    isLoading,
    saveMessage,
    clearMessages,
  };
}
