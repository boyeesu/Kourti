/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useUserOrganization } from './useUserOrganization';
import { invokeNodeApi } from '@/lib/backendApi';

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
        const orgId = typeof organizationId === 'string' ? organizationId.trim() : '';
        if (!orgId) {
          throw new Error(
            'Organization not found. Please ensure your account is linked to an organization.'
          );
        }

        let data: { response?: string; error?: string } | null = null;

        data = await invokeNodeApi<{ response?: string; error?: string }>(
          '/api/v1/ai/ream-assistant',
          {
            method: 'POST',
            body: {
              message: message.trim(),
              conversationHistory: conversationHistory.map((msg) => ({
                role: msg.role,
                content: msg.content,
              })),
              ...(options.documentContext && { context: options.documentContext }),
            },
          }
        );

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
