/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import {
  validateFile,
  MAX_CHAT_ATTACHMENT_SIZE,
  ALLOWED_CHAT_MIME_TYPES,
} from '@/lib/fileValidation';
import { getNodeChatFileSignedUrl, invokeNodeApi } from '@/lib/backendApi';

export interface FileMetadata {
  file_name: string;
  file_size: number;
  file_type: string;
  file_path: string;
  file_url?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: 'text' | 'file' | 'system';
  metadata?: FileMetadata | Record<string, any>;
  reply_to_id?: string | null;
  reply_to?: Message | null;
  created_at: string;
  updated_at: string;
  sender?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  };
}

export interface Conversation {
  id: string;
  organization_id: string;
  type: 'direct' | 'group';
  name: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  participants?: Array<{
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  }>;
  last_message?: Message;
  unread_count?: number;
}

/**
 * Hook to fetch user's conversations - OPTIMIZED to use single RPC call
 * This eliminates N+1 query issues by fetching all data in one database round-trip
 */
export function useConversations() {
  const { user } = useAuth();
  const { data: organizationId } = useUserOrganization();

  return useQuery({
    queryKey: ['conversations', organizationId, user?.id],
    queryFn: async () => {
      if (!user || !organizationId) return [];

      return invokeNodeApi<Conversation[]>('/api/v1/chat/conversations');
    },
    enabled: !!user && !!organizationId,
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to fetch messages for a conversation with realtime updates
 */
export function useMessages(conversationId: string | null) {
  const query = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      return invokeNodeApi<Message[]>(`/api/v1/chat/conversations/${conversationId}/messages`);
    },
    enabled: !!conversationId,
    refetchInterval: 5000,
  });

  return query;
}

/**
 * Hook to send a message with optimistic updates
 */
export function useSendMessage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      conversationId,
      content,
      replyToId,
    }: {
      conversationId: string;
      content: string;
      replyToId?: string | null;
    }) => {
      if (!user) {
        throw new Error('User not authenticated');
      }

      if (!content || !content.trim()) {
        throw new Error('Message content cannot be empty');
      }

      return invokeNodeApi<Message>(`/api/v1/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: {
          content: content.trim(),
          replyToId: replyToId || null,
        },
      });
    },
    // Optimistic update - show message immediately
    onMutate: async ({ conversationId, content, replyToId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['messages', conversationId] });

      // Snapshot previous value
      const previousMessages = queryClient.getQueryData<Message[]>(['messages', conversationId]);

      // Find the reply_to message if replyToId is provided
      const replyToMessage = replyToId ? previousMessages?.find((m) => m.id === replyToId) : null;

      // Create optimistic message
      const optimisticMessage: Message = {
        id: `temp-${Date.now()}`,
        conversation_id: conversationId,
        sender_id: user!.id,
        content: content.trim(),
        message_type: 'text',
        reply_to_id: replyToId || null,
        reply_to: replyToMessage || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sender: {
          id: user!.id,
          first_name: (user?.user_metadata?.first_name as string) || null,
          last_name: (user?.user_metadata?.last_name as string) || null,
          email: (user?.email as string) || null,
        },
      };

      // Optimistically add message
      queryClient.setQueryData<Message[]>(['messages', conversationId], (old = []) => {
        return [...old, optimisticMessage];
      });

      return { previousMessages, optimisticMessage };
    },
    onError: (_err, { conversationId }, context) => {
      // Rollback on error
      if (context?.previousMessages) {
        queryClient.setQueryData(['messages', conversationId], context.previousMessages);
      }
    },
    onSettled: (data, error, { conversationId }) => {
      // Always invalidate conversations to update last message
      queryClient.invalidateQueries({ queryKey: ['conversations'] });

      // If we have the real data, replace the optimistic message
      if (data && !error) {
        queryClient.setQueryData<Message[]>(['messages', conversationId], (old = []) => {
          // Remove temp messages and add real one if not already there
          const filtered = old.filter((m) => !m.id.startsWith('temp-'));
          if (!filtered.some((m) => m.id === (data as any).id)) {
            return [...filtered, data as any];
          }
          return filtered;
        });
      }
    },
  });
}

/**
 * Hook to send a file message with upload to storage
 */
export function useSendFileMessage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async ({
      conversationId,
      file,
    }: {
      conversationId: string;
      file: File;
    }): Promise<Message> => {
      if (!user) {
        throw new Error('User not authenticated');
      }

      if (!organizationId) {
        throw new Error('Organization not found');
      }

      // Validate file before upload
      const validation = validateFile(file, {
        maxSize: MAX_CHAT_ATTACHMENT_SIZE,
        allowedTypes: ALLOWED_CHAT_MIME_TYPES,
      });
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid file');
      }

      // Upload file via Node backend
      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `${organizationId}/${conversationId}/${timestamp}_${sanitizedName}`;

      const signed = await getNodeChatFileSignedUrl(filePath, {
        disposition: 'inline',
        expiresIn: 3600,
        filename: file.name,
      }).catch(() => null);

      const message = await invokeNodeApi<Message>(
        `/api/v1/chat/conversations/${conversationId}/messages/file`,
        {
          method: 'POST',
          body: {
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            filePath,
          },
        }
      );

      return {
        ...message,
        metadata: {
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
          file_path: filePath,
          file_url: signed?.signedUrl,
        },
      } as Message;
    },
    // Optimistic update for file messages
    onMutate: async ({ conversationId, file }) => {
      await queryClient.cancelQueries({ queryKey: ['messages', conversationId] });

      const previousMessages = queryClient.getQueryData<Message[]>(['messages', conversationId]);

      const optimisticMessage: Message = {
        id: `temp-file-${Date.now()}`,
        conversation_id: conversationId,
        sender_id: user!.id,
        content: file.name,
        message_type: 'file',
        metadata: {
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
          file_path: '',
          file_url: URL.createObjectURL(file), // Temporary local URL for preview
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sender: {
          id: user!.id,
          first_name: (user?.user_metadata?.first_name as string) || null,
          last_name: (user?.user_metadata?.last_name as string) || null,
          email: (user?.email as string) || null,
        },
      };

      queryClient.setQueryData<Message[]>(['messages', conversationId], (old = []) => {
        return [...old, optimisticMessage];
      });

      return { previousMessages, optimisticMessage };
    },
    onError: (_err, { conversationId }, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(['messages', conversationId], context.previousMessages);
      }
    },
    onSettled: (data, error, { conversationId }) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });

      if (data && !error) {
        queryClient.setQueryData<Message[]>(['messages', conversationId], (old = []) => {
          const filtered = old.filter((m) => !m.id.startsWith('temp-file-'));
          if (!filtered.some((m) => m.id === data.id)) {
            return [...filtered, data];
          }
          return filtered;
        });
      }
    },
  });
}

/**
 * Hook to create or get direct conversation
 */
export function useGetOrCreateDirectConversation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (otherUserId: string) => {
      if (!user) throw new Error('User not authenticated');

      const response = await invokeNodeApi<{ conversationId: string }>(
        '/api/v1/chat/conversations/direct',
        {
          method: 'POST',
          body: { otherUserId },
        }
      );

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      return response.conversationId;
    },
  });
}

/**
 * Hook to mark messages as read
 */
export function useMarkAsRead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!user) return;

      await invokeNodeApi<void>(`/api/v1/chat/conversations/${conversationId}/read`, {
        method: 'POST',
      });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      return;
    },
  });
}

/**
 * Hook to get total unread message count across all conversations
 */
export function useTotalUnreadCount() {
  const { data: conversations = [] } = useConversations();

  const totalUnread = conversations.reduce((sum, conv) => sum + (conv.unread_count || 0), 0);

  return totalUnread;
}
