import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { useEffect } from 'react';

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
 * Hook to fetch user's conversations
 */
export function useConversations() {
  const { user } = useAuth();
  const { data: organizationId } = useUserOrganization();

  return useQuery({
    queryKey: ['conversations', organizationId, user?.id],
    queryFn: async () => {
      if (!user || !organizationId) return [];

      // Get conversations where user is a participant - use a simpler query
      // First get conversation IDs where user is a participant
      const { data: participantData, error: participantError } = await supabase
        .from('conversation_participants' as any)
        .select('conversation_id, last_read_at')
        .eq('user_id', user.id);

      if (participantError) {
        console.error('Error fetching participant data:', participantError);
        // If it's an RLS error, return empty array instead of throwing
        // This prevents the entire app from breaking
        if (participantError.code === 'PGRST301' || participantError.message?.includes('RLS') || participantError.message?.includes('policy')) {
          console.warn('RLS policy error detected. Please run FIX_CHAT_RLS_NOW.sql in Supabase SQL Editor.');
          return [];
        }
        throw participantError;
      }

      if (!participantData || participantData.length === 0) return [];

      const participantDataTyped = participantData as unknown as Array<{ conversation_id: string; last_read_at: string | null }>;
      const conversationIds = participantDataTyped.map(p => p.conversation_id);
      const lastReadMap = new Map(participantDataTyped.map(p => [p.conversation_id, p.last_read_at]));

      // Get conversations with all participants
      const { data: conversations, error: conversationsError } = await supabase
        .from('conversations' as any)
        .select(`
          *,
          conversation_participants(
            user_id,
            last_read_at
          )
        `)
        .in('id', conversationIds)
        .eq('organization_id', organizationId)
        .order('updated_at', { ascending: false });

      if (conversationsError) {
        console.error('Error fetching conversations:', conversationsError);
        throw conversationsError;
      }
      
      if (!conversations || conversations.length === 0) return [];

      // Get all unique user IDs from participants
      const allUserIds = new Set<string>();
      conversations.forEach((conv: any) => {
        (conv.conversation_participants || []).forEach((p: any) => {
          if (p.user_id) allUserIds.add(p.user_id);
        });
      });

      // Get last messages first to collect sender IDs
      const lastMessagesData = await Promise.all(
        conversations.map(async (conv: any) => {
          const { data: lastMessage } = await supabase
            .from('messages' as any)
            .select('*')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          return { conversationId: conv.id, lastMessage };
        })
      );

      // Collect sender IDs from last messages
      lastMessagesData.forEach(({ lastMessage }) => {
        const message = lastMessage as any;
        if (message?.sender_id) {
          allUserIds.add(message.sender_id);
        }
      });

      // Fetch profiles for all users (participants + senders) in one query
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles' as any)
        .select('user_id, first_name, last_name, email')
        .in('user_id', Array.from(allUserIds));

      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        // Don't throw, just continue without profiles
      }

      // Create a map of user_id -> profile for quick lookup
      const profilesMap = new Map(
        (profiles || []).map((p: any) => [p.user_id, p])
      );

      // Get last message for each conversation
      const conversationsWithMessages = await Promise.all(
        (conversations || []).map(async (conv: any) => {
          const lastMessageData = lastMessagesData.find(
            (lm) => lm.conversationId === conv.id
          );
          const lastMessage = lastMessageData?.lastMessage;

          // Get unread count - use the last_read_at from the map
          const lastReadAt = lastReadMap.get(conv.id) || '1970-01-01';
          
          const { count: unreadCount } = await supabase
            .from('messages' as any)
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', conv.id)
            .gt('created_at', lastReadAt)
            .neq('sender_id', user.id);

          const message = lastMessage as any;
          return {
            ...conv,
            last_message: message ? {
              ...message,
              sender: profilesMap.get(message.sender_id) || null
            } : null,
            unread_count: unreadCount || 0,
            participants: (conv.conversation_participants || []).map((p: any) => ({
              user_id: p.user_id,
              last_read_at: p.last_read_at,
              ...(profilesMap.get(p.user_id) || {})
            }))
          };
        })
      );

      return conversationsWithMessages as Conversation[];
    },
    enabled: !!user && !!organizationId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch messages for a conversation with realtime updates
 */
export function useMessages(conversationId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      const { data, error } = await supabase
        .from('messages' as any)
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) return [];

      // Get all unique sender IDs
      const senderIds = [...new Set(data.map((msg: any) => msg.sender_id).filter(Boolean))];

      // Fetch profiles for all senders in one query
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles' as any)
        .select('user_id, first_name, last_name, email')
        .in('user_id', senderIds);

      if (profilesError) {
        console.error('Error fetching sender profiles:', profilesError);
        // Don't throw, just continue without profiles
      }

      // Create a map of user_id -> profile for quick lookup
      const profilesMap = new Map(
        (profiles || []).map((p: any) => [p.user_id, p])
      );

      // Create messages with sender info
      const messagesWithSender = (data || []).map((msg: any) => ({
        ...msg,
        sender: profilesMap.get(msg.sender_id) || null
      }));

      // Create a map of message_id -> message for reply_to lookup
      const messagesMap = new Map(messagesWithSender.map((m: any) => [m.id, m]));

      // Add reply_to data to messages
      return messagesWithSender.map((msg: any) => ({
        ...msg,
        reply_to: msg.reply_to_id ? messagesMap.get(msg.reply_to_id) || null : null
      })) as Message[];
    },
    enabled: !!conversationId,
  });

  // Set up realtime subscription
  useEffect(() => {
    if (!conversationId || !user) return;

    const newChannel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages' as any,
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMessagePayload = payload.new as any;
          
          // First, immediately add the message to ensure it shows up
          // This prevents the message from being lost if profile fetch fails
          let senderProfile: { id: string; first_name: string | null; last_name: string | null; email: string | null } | undefined;
          
          try {
            // Fetch sender profile (non-blocking for message display)
            const { data: profile, error: profileError } = await supabase
              .from('profiles' as any)
              .select('first_name, last_name, email')
              .eq('user_id', newMessagePayload.sender_id)
              .maybeSingle() as unknown as { data: { first_name: string | null; last_name: string | null; email: string | null } | null; error: any }; // Use maybeSingle instead of single to avoid errors when no profile exists

            if (!profileError && profile) {
              senderProfile = {
                id: newMessagePayload.sender_id,
                first_name: profile.first_name,
                last_name: profile.last_name,
                email: profile.email
              };
            }
          } catch (err) {
            console.warn('Failed to fetch sender profile for realtime message:', err);
          }

          const newMessage: Message = {
            ...newMessagePayload,
            sender: senderProfile
          };
          
          queryClient.setQueryData(['messages', conversationId], (old: Message[] | undefined) => {
            const messages = old ?? [];
            // Avoid duplicates (check both real IDs and temp IDs)
            if (messages.some(m => m.id === newMessage.id)) return messages;
            // Also avoid adding if we already have a temp version of this message from optimistic update
            // by checking content + sender + recent timestamp
            const recentTempMessage = messages.find(m => 
              m.id.startsWith('temp-') && 
              m.sender_id === newMessage.sender_id && 
              m.content === newMessage.content
            );
            if (recentTempMessage) {
              // Replace temp message with real one
              return messages.map(m => m.id === recentTempMessage.id ? newMessage : m);
            }
            return [...messages, newMessage];
          });

          // Update conversations list
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Subscribed to messages for conversation ${conversationId}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`Failed to subscribe to messages for conversation ${conversationId}`);
        }
      });

    return () => {
      supabase.removeChannel(newChannel);
    };
  }, [conversationId, user, queryClient]);

  return query;
}

/**
 * Hook to send a message with optimistic updates
 */
export function useSendMessage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ conversationId, content, replyToId }: { conversationId: string; content: string; replyToId?: string | null }) => {
      if (!user) {
        throw new Error('User not authenticated');
      }

      if (!content || !content.trim()) {
        throw new Error('Message content cannot be empty');
      }

      const { data, error } = await supabase
        .from('messages' as any)
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: content.trim(),
          message_type: 'text',
          reply_to_id: replyToId || null,
        } as any)
        .select()
        .single();

      if (error) {
        console.error('Error inserting message:', error);
        throw new Error(error.message || 'Failed to send message');
      }

      // Update conversation updated_at - fire and forget (non-blocking)
      supabase
        .from('conversations' as any)
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId)
        .then(({ error: updateError }) => {
          if (updateError) console.error('Error updating conversation timestamp:', updateError);
        });

      return data;
    },
    // Optimistic update - show message immediately
    onMutate: async ({ conversationId, content, replyToId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['messages', conversationId] });

      // Snapshot previous value
      const previousMessages = queryClient.getQueryData<Message[]>(['messages', conversationId]);

      // Find the reply_to message if replyToId is provided
      const replyToMessage = replyToId 
        ? previousMessages?.find(m => m.id === replyToId) 
        : null;

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
          first_name: user?.user_metadata?.first_name || null,
          last_name: user?.user_metadata?.last_name || null,
          email: user?.email || null,
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
          const filtered = old.filter(m => !m.id.startsWith('temp-'));
          if (!filtered.some(m => m.id === (data as any).id)) {
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
      file 
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

      // Upload file to Supabase storage
      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `${organizationId}/${conversationId}/${timestamp}_${sanitizedName}`;

      const { error: uploadError } = await supabase.storage
        .from('Chat_Storage')
        .upload(filePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        console.error('File upload error:', uploadError);
        throw new Error(`Failed to upload file: ${uploadError.message}`);
      }

      // Get signed URL (1 hour expiry, will be refreshed when viewing)
      const { data: signedUrlData } = await supabase.storage
        .from('Chat_Storage')
        .createSignedUrl(filePath, 3600);

      const fileMetadata: FileMetadata = {
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        file_path: filePath,
        file_url: signedUrlData?.signedUrl,
      };

      // Create file message
      const { data, error } = await supabase
        .from('messages' as any)
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: file.name, // Use filename as content for searchability
          message_type: 'file',
          metadata: fileMetadata,
        } as any)
        .select()
        .single();

      if (error) {
        console.error('Error inserting file message:', error);
        // Try to clean up uploaded file on message insert failure
        await supabase.storage.from('Chat_Storage').remove([filePath]);
        throw new Error(error.message || 'Failed to send file message');
      }

      // Update conversation timestamp (fire and forget)
      supabase
        .from('conversations' as any)
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId)
        .then(({ error: updateError }) => {
          if (updateError) console.error('Error updating conversation timestamp:', updateError);
        });

      return data as unknown as Message;
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
          first_name: user?.user_metadata?.first_name || null,
          last_name: user?.user_metadata?.last_name || null,
          email: user?.email || null,
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
          const filtered = old.filter(m => !m.id.startsWith('temp-file-'));
          if (!filtered.some(m => m.id === data.id)) {
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

      const { data, error } = await supabase.rpc('get_or_create_direct_conversation' as any, {
        p_other_user_id: otherUserId
      });

      if (error) throw error;

      // Invalidate conversations
      queryClient.invalidateQueries({ queryKey: ['conversations'] });

      return data as string;
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

      const { error } = await supabase
        .from('conversation_participants' as any)
        .update({ last_read_at: new Date().toISOString() } as any)
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error marking conversation as read:', error);
        // Don't throw - this is a non-critical operation
        // The error is likely due to RLS policy issues
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
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
