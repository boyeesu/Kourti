import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { logError, logWarn } from '@/lib/logger';
import { invokeNodeApi } from '@/lib/backendApi';

// Payload size limits
// Conservative limits to account for JSON overhead, conversation history, and RAG context
const MAX_CONTENT_LENGTH = 100000; // ~100k characters (safe for most documents)
const MAX_RAG_CONTEXT_LENGTH = 20000; // 20k characters for RAG context
const MAX_CONVERSATION_HISTORY_LENGTH = 10000; // 10k characters for conversation history

type AdvancedAnalysisResponse = {
  analysis?: string;
  content?: string;
  result?: string;
  success?: boolean;
  tokensUsed?: number;
  modelUsed?: string;
  choices?: Array<{ message?: { content?: string } }>;
};

async function invokeAdvancedAnalysis(payload: Record<string, unknown>) {
  try {
    const data = await invokeNodeApi<AdvancedAnalysisResponse>(
      '/api/v1/ai/advanced-contract-analysis',
      {
        method: 'POST',
        body: payload,
      }
    );
    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Truncate content intelligently, keeping beginning and end
 * This preserves the most important parts (title/intro and conclusion)
 */
function truncateContent(
  content: string,
  maxLength: number
): { content: string; wasTruncated: boolean } {
  if (content.length <= maxLength) {
    return { content, wasTruncated: false };
  }

  // Take 60% from start, 40% from end
  const startLength = Math.floor(maxLength * 0.6);
  const endLength = Math.floor(maxLength * 0.4);

  const start = content.substring(0, startLength);
  const end = content.substring(content.length - endLength);

  return {
    content: `${start}\n\n[... Content truncated for size management. Showing beginning and end of document ...]\n\n${end}`,
    wasTruncated: true,
  };
}

/**
 * Validate and truncate payload components to prevent request failures
 */
function preparePayload({
  content,
  ragContext,
  conversationHistory,
}: {
  content: string;
  ragContext?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}): {
  content: string;
  ragContext?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  warnings: string[];
} {
  const warnings: string[] = [];

  // Truncate main content if needed
  const contentResult = truncateContent(content, MAX_CONTENT_LENGTH);
  if (contentResult.wasTruncated) {
    warnings.push(
      `Document content truncated from ${content.length} to ${MAX_CONTENT_LENGTH} characters`
    );
    logWarn('Document content truncated for payload size', {
      originalLength: content.length,
      truncatedLength: MAX_CONTENT_LENGTH,
    });
  }

  // Truncate RAG context if needed
  let processedRagContext = ragContext;
  if (ragContext && ragContext.length > MAX_RAG_CONTEXT_LENGTH) {
    const ragResult = truncateContent(ragContext, MAX_RAG_CONTEXT_LENGTH);
    processedRagContext = ragResult.content;
    warnings.push(
      `RAG context truncated from ${ragContext.length} to ${MAX_RAG_CONTEXT_LENGTH} characters`
    );
    logWarn('RAG context truncated for payload size', {
      originalLength: ragContext.length,
      truncatedLength: MAX_RAG_CONTEXT_LENGTH,
    });
  }

  // Truncate conversation history if needed
  let processedConversationHistory = conversationHistory;
  if (conversationHistory && conversationHistory.length > 0) {
    const historyText = conversationHistory.map((msg) => msg.content).join(' ');
    if (historyText.length > MAX_CONVERSATION_HISTORY_LENGTH) {
      // Keep only the most recent messages that fit
      let totalLength = 0;
      const keptMessages: Array<{ role: string; content: string }> = [];

      for (let i = conversationHistory.length - 1; i >= 0; i--) {
        const msg = conversationHistory[i];
        const msgLength = msg.content.length;

        if (totalLength + msgLength > MAX_CONVERSATION_HISTORY_LENGTH) {
          break;
        }

        keptMessages.unshift(msg);
        totalLength += msgLength;
      }

      processedConversationHistory = keptMessages;
      warnings.push(
        `Conversation history truncated from ${conversationHistory.length} to ${keptMessages.length} messages`
      );
      logWarn('Conversation history truncated for payload size', {
        originalCount: conversationHistory.length,
        keptCount: keptMessages.length,
      });
    }
  }

  return {
    content: contentResult.content,
    ragContext: processedRagContext,
    conversationHistory: processedConversationHistory,
    warnings,
  };
}

/**
 * Enhanced hook for document analysis with streaming support and improved error handling
 */
export function useEnhancedDocumentAnalysis() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // Basic document analysis mutation (non-streaming)
  const documentAnalysis = useMutation({
    mutationFn: async ({
      content,
      analysisType = 'general',
    }: {
      content: string;
      analysisType?: 'general' | 'risk' | 'summary' | 'extract' | 'compare';
    }) => {
      try {
        // Prepare payload with size checks
        const payload = preparePayload({ content });

        if (payload.warnings.length > 0) {
          logWarn('Payload size management applied for basic analysis', {
            warnings: payload.warnings,
            originalContentLength: content.length,
          });
        }

        // Call the advanced contract analysis endpoint
        const { data, error } = await invokeAdvancedAnalysis({
          text: payload.content,
          analysisType,
          goal:
            analysisType === 'general'
              ? 'Provide a comprehensive analysis of this document'
              : analysisType,
        });

        if (error) {
          logError('Document analysis function call failed', {
            error: error.message || String(error),
            errorName: error.name,
            contentLength: payload.content.length,
            originalContentLength: content.length,
            analysisType,
          });
          throw error;
        }

        return { analysis: data?.analysis || 'Analysis completed' };
      } catch (error) {
        logError('Document analysis failed', error);
        throw error;
      }
    },
    onError: (error) => {
      toast.error('Analysis Failed', {
        description: error instanceof Error ? error.message : 'Failed to analyze document',
      });
    },
  });

  // Cancel any ongoing streaming
  const cancelStreaming = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setIsStreaming(false);
    }
  }, [abortController]);

  // Streaming document analysis with real OpenAI streaming
  const streamDocumentAnalysis = useCallback(
    async ({
      content,
      analysisType = 'general',
      onProgress,
      conversationHistory,
      ragContext,
    }: {
      content: string;
      analysisType?: 'general' | 'risk' | 'summary' | 'extract' | 'compare';
      onProgress: (content: string, done: boolean) => void;
      conversationHistory?: Array<{ role: string; content: string }>;
      ragContext?: string;
    }) => {
      // Cancel any existing stream
      cancelStreaming();

      try {
        setIsStreaming(true);
        setStreamingContent('');

        // Check if content is too short for meaningful analysis
        if (content.trim().length < 50) {
          const shortMessage =
            'Document content is too short for detailed analysis. Please provide a document with more substantial content.';
          setStreamingContent(shortMessage);
          onProgress(shortMessage, true);
          setIsStreaming(false);
          setAbortController(null);
          return;
        }

        // Create a new abort controller for this request
        const controller = new AbortController();
        setAbortController(controller);

        // Prepare payload with size checks and truncation
        const payload = preparePayload({
          content,
          ragContext,
          conversationHistory,
        });

        // Log warnings if truncation occurred
        if (payload.warnings.length > 0) {
          logWarn('Payload size warnings', { warnings: payload.warnings });
          logWarn('Payload size management applied', {
            warnings: payload.warnings,
            originalContentLength: content.length,
            processedContentLength: payload.content.length,
          });
        }

        // Use the advanced contract analysis endpoint (non-streaming)
        const { data: responseData, error } = await invokeAdvancedAnalysis({
          text: payload.content,
          analysisType,
          goal:
            analysisType === 'general'
              ? 'Provide a comprehensive analysis of this document'
              : analysisType,
          conversationHistory: payload.conversationHistory || [],
          ragContext: payload.ragContext,
          stream: false,
        });

        if (import.meta.env.DEV) {
          console.log('Analysis response:', {
            hasData: !!responseData,
            hasError: !!error,
            responseKeys: responseData ? Object.keys(responseData) : [],
          });
        }

        if (error) {
          logError('Analysis request error', error);
          logError('Advanced contract analysis function call failed', {
            error: error.message || String(error),
            errorName: error.name,
            stack: error.stack,
            contentLength: content.length,
            hasConversationHistory: !!conversationHistory && conversationHistory.length > 0,
            hasRAGContext: !!ragContext,
          });
          throw error;
        }

        // Handle the response - extract analysis content
        let analysisContent = '';

        if (responseData) {
          if (typeof responseData === 'string') {
            analysisContent = responseData;
          } else if (typeof responseData === 'object') {
            // Try different possible response shapes
            analysisContent =
              responseData.analysis || responseData.content || responseData.result || '';

            // If still no content, check if the response is the raw data structure
            if (!analysisContent && responseData.choices?.[0]?.message?.content) {
              analysisContent = responseData.choices[0].message.content;
            }
          }
        }

        if (!analysisContent) {
          logWarn('No analysis content found in response', { responseData });
          analysisContent = 'Unable to extract analysis. Please try again.';
        }

        if (import.meta.env.DEV) {
          console.log('Extracted analysis content length:', analysisContent.length);
        }

        // Show content immediately (no streaming simulation)
        setStreamingContent(analysisContent);
        onProgress(analysisContent, true);
        setIsStreaming(false);
        setAbortController(null);

        return { analysis: analysisContent };
      } catch (error) {
        // Handle abort separately from other errors
        if (error instanceof DOMException && error.name === 'AbortError') {
          return { analysis: streamingContent, aborted: true };
        }

        setIsStreaming(false);
        setAbortController(null);

        logError('Document streaming analysis failed', error);
        toast.error('Analysis Failed', {
          description: error instanceof Error ? error.message : 'Failed to analyze document',
        });

        throw error;
      }
    },
    [cancelStreaming, streamingContent]
  );

  return {
    analyzeDocument: documentAnalysis.mutateAsync,
    streamAnalysis: streamDocumentAnalysis,
    cancelStreaming,
    isLoading: documentAnalysis.isPending,
    isStreaming,
    streamingContent,
    error: documentAnalysis.error,
  };
}
