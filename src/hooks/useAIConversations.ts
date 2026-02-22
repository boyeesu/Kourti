import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logError } from '@/lib/logger';

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
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export function useAIConversations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all conversations for the current user
  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["ai-conversations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_conversations")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return data as AIConversation[];
    },
  });

  // Create a new conversation
  const createConversation = useMutation({
    mutationFn: async (title: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id, user_id")
        .eq("user_id", user.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      const { data, error } = await supabase
        .from("ai_conversations")
        .insert({
          organization_id: profile.organization_id,
          user_id: profile.user_id,
          title,
        })
        .select()
        .single();

      if (error) throw error;
      return data as AIConversation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create conversation",
        variant: "destructive",
      });
      logError("Create conversation error", error);
    },
  });

  // Update conversation title
  const updateConversation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase
        .from("ai_conversations")
        .update({ title })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
    },
  });

  // Delete a conversation
  const deleteConversation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ai_conversations")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
      toast({
        title: "Conversation deleted",
        description: "The conversation has been removed",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete conversation",
        variant: "destructive",
      });
      logError("Delete conversation error", error);
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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch messages for a conversation
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["ai-conversation-messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      const { data, error } = await supabase
        .from("ai_conversation_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as AIMessage[];
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
      role: "user" | "assistant" | "system";
      content: string;
    }) => {
      const { error } = await supabase
        .from("ai_conversation_messages")
        .insert({
          conversation_id: conversationId,
          role,
          content,
        });

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["ai-conversation-messages", variables.conversationId],
      });
      queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to save message",
        variant: "destructive",
      });
      logError("Save message error", error);
    },
  });

  // Delete all messages in a conversation (for clearing)
  const clearMessages = useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from("ai_conversation_messages")
        .delete()
        .eq("conversation_id", conversationId);

      if (error) throw error;
    },
    onSuccess: (_, conversationId) => {
      queryClient.invalidateQueries({
        queryKey: ["ai-conversation-messages", conversationId],
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
