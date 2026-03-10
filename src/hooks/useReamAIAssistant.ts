/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useUserOrganization } from './useUserOrganization';
import { invokeFunctionWithCsrf } from '@/lib/csrfClient';

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
  const { data: organizationId } = useUserOrganization();

  const sendMessage = useCallback(
    async (
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
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          throw new Error('Authentication required');
        }

        const orgId = typeof organizationId === 'string' ? organizationId.trim() : '';
        if (!orgId) {
          throw new Error(
            'Organization not found. Please ensure your account is linked to an organization.'
          );
        }

        // Call the Ream AI Assistant edge function with CSRF protection
        // Note: userId and organizationId are derived from JWT on the backend
        const body = {
          message: message.trim(),
          conversationHistory: conversationHistory.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          ...(options.documentContext && { context: options.documentContext }),
        };
        const { data, error } = await invokeFunctionWithCsrf<{ error?: string; response?: string }>(
          'ream-ai-assistant',
          {
            body,
          }
        );

        if (error) {
          throw new Error(error.message || 'Failed to invoke AI assistant');
        }

        if (!data) {
          throw new Error('No data returned from AI assistant');
        }

        if (data.error) {
          throw new Error(data.error || 'AI assistant returned an error');
        }

        if (!data.response) {
          throw new Error('No response from AI assistant');
        }

        return data.response;
      } catch (error: any) {
        toast.error('Error', {
          description: error.message || 'Failed to get response from AI assistant',
        });
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [organizationId]
  );

  return {
    sendMessage,
    isLoading,
  };
}
