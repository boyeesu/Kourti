/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useUserOrganization } from './useUserOrganization';
import { invokeNodeApi } from '@/lib/backendApi';
import { env } from '@/lib/env';
import { getAccessToken, refreshSession } from '@/lib/authClient';

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

async function getValidToken(): Promise<string> {
  const token = getAccessToken();
  if (token) return token;
  const session = await refreshSession();
  return session.accessToken;
}

export function useReamAIAssistant() {
  const [isLoading, setIsLoading] = useState(false);
  const { data: organizationId } = useUserOrganization();
  const abortRef = useRef<AbortController | null>(null);

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
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      try {
        const orgId = typeof organizationId === 'string' ? organizationId.trim() : '';
        if (!orgId) {
          throw new Error(
            'Organization not found. Please ensure your account is linked to an organization.'
          );
        }

        const useStreaming = !!options.onProgress;

        if (useStreaming) {
          const accessToken = await getValidToken();
          const url = new URL('/api/v1/ai/ream-assistant', env.BACKEND_API_URL);

          const response = await fetch(url.toString(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              message: message.trim(),
              conversationHistory: conversationHistory.map((msg) => ({
                role: msg.role,
                content: msg.content,
              })),
              ...(options.documentContext && { context: options.documentContext }),
              stream: true,
            }),
            signal: abortRef.current.signal,
            credentials: 'include',
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new Error((errorData as any)?.error || `AI request failed (${response.status})`);
          }

          const reader = response.body?.getReader();
          if (!reader) throw new Error('No response body');

          const decoder = new TextDecoder();
          let fullContent = '';
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;
              try {
                const event = JSON.parse(trimmed.slice(6)) as {
                  type: string;
                  content?: string;
                  error?: string;
                };
                if (event.type === 'delta' && event.content) {
                  fullContent += event.content;
                  options.onProgress!(fullContent, false);
                } else if (event.type === 'done') {
                  options.onProgress!(fullContent, true);
                } else if (event.type === 'error') {
                  throw new Error(event.error || 'Streaming error');
                }
              } catch (e) {
                if (e instanceof Error && e.message !== 'Streaming error') continue;
                throw e;
              }
            }
          }

          return fullContent;
        }

        // Non-streaming path (existing behavior)
        const data = await invokeNodeApi<{ response?: string; error?: string }>(
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
        if (error.name === 'AbortError') return '';
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

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    sendMessage,
    isLoading,
    abort,
  };
}
