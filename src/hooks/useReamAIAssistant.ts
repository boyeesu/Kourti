import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUserOrganization } from './useUserOrganization';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface UseReamAIAssistantOptions {
  onProgress?: (content: string, done: boolean) => void;
  documentContext?: {
    documentId?: string;
    documentContent?: string;
  };
}

export function useReamAIAssistant() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { data: organizationId } = useUserOrganization();

  const sendMessage = useCallback(async (
    message: string,
    conversationHistory: Message[] = [],
    options: UseReamAIAssistantOptions = {}
  ) => {
    if (!message.trim()) {
      throw new Error('Message cannot be empty');
    }

    setIsLoading(true);

    try {
      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        throw new Error('Authentication required');
      }

      if (!organizationId) {
        throw new Error('Organization not found');
      }

      // Call the Ream AI Assistant edge function
      const { data, error } = await supabase.functions.invoke('ream-ai-assistant', {
        body: {
          message: message.trim(),
          conversationHistory: conversationHistory.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          userId: user.id,
          organizationId: organizationId,
          context: options.documentContext,
        },
      });

      if (error) {
        throw error;
      }

      if (!data?.response) {
        throw new Error('No response from AI assistant');
      }

      return data.response;
    } catch (error: any) {
      console.error('Error in Ream AI Assistant:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to get response from AI assistant',
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, toast]);

  return {
    sendMessage,
    isLoading,
  };
}

