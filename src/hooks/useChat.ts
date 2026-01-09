import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { useEffect } from 'react';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: 'text' | 'file' | 'system';
  metadata?: Record<string, any>;
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

      return (data || []).map((msg: any) => ({
        ...msg,
        sender: profilesMap.get(msg.sender_id) || null
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
          // Fetch sender profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('first_name, last_name, email')
            .eq('user_id', (payload.new as any).sender_id)
            .single();

          const newMessage: Message = {
            ...(payload.new as any),
            sender: profile ? {
              id: (payload.new as any).sender_id,
              ...profile
            } : undefined
          };
          
          queryClient.setQueryData(['messages', conversationId], (old: Message[] = []) => {
            // Avoid duplicates
            if (old.some(m => m.id === newMessage.id)) return old;
            return [...old, newMessage];
          });

          // Update conversations list
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
      )
      .subscribe();

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
    mutationFn: async ({ conversationId, content }: { conversationId: string; content: string }) => {
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
        } as any)
        .select()
        .single();

      if (error) {
        console.error('Error inserting message:', error);
        throw new Error(error.message || 'Failed to send message');
      }

      // Update conversation updated_at
      await supabase
        .from('conversations' as any)
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      return data;
    },
    // Optimistic update - show message immediately
    onMutate: async ({ conversationId, content }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['messages', conversationId] });

      // Snapshot previous value
      const previousMessages = queryClient.getQueryData<Message[]>(['messages', conversationId]);

      // Create optimistic message
      const optimisticMessage: Message = {
        id: `temp-${Date.now()}`,
        conversation_id: conversationId,
        sender_id: user!.id,
        content: content.trim(),
        message_type: 'text',
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
    onError: (err, { conversationId }, context) => {
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
