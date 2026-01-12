import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logError } from '@/lib/logger';

// Use Supabase Edge Function instead of external API
// This function name is now defined in the call itself

/**
 * Enhanced hook for document analysis with streaming support and improved error handling
 */
export function useEnhancedDocumentAnalysis() {
  const { toast } = useToast();

  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // Basic document analysis mutation (non-streaming)
  const documentAnalysis = useMutation({
    mutationFn: async ({
      content,
      analysisType = 'general'
    }: {
      content: string;
      analysisType?: 'general' | 'risk' | 'summary' | 'extract' | 'compare';
    }) => {
      try {
        // Ensure we have an active session
        const { data: sessionData } = await supabase.auth.getSession();

        if (!sessionData?.session) {
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

          if (refreshError || !refreshData?.session) {
            throw new Error('Authentication required. Please sign in again.');
          }
        }

        // Call the advanced contract analysis edge function
        const { data, error } = await supabase.functions.invoke('advanced-contract-analysis', {
          body: {
            text: content,
            analysisType: analysisType,
            goal: analysisType === 'general'
              ? 'Provide a comprehensive analysis of this document'
              : analysisType
          }
        });

        if (error) throw error;

        return { analysis: data?.analysis || 'Analysis completed' };
      } catch (error) {
        logError('Document analysis failed', error);
        throw error;
      }
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Analysis Failed',
        description: error instanceof Error ? error.message : 'Failed to analyze document',
      });
    }
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
  const streamDocumentAnalysis = useCallback(async ({
    content,
    analysisType = 'general',
    onProgress,
    conversationHistory,
    ragContext
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
        const shortMessage = 'Document content is too short for detailed analysis. Please provide a document with more substantial content.';
        setStreamingContent(shortMessage);
        onProgress(shortMessage, true);
        setIsStreaming(false);
        setAbortController(null);
        return;
      }

      // Create a new abort controller for this request
      const controller = new AbortController();
      setAbortController(controller);

      // Ensure we have an active session
      const { data: sessionData } = await supabase.auth.getSession();

      if (!sessionData?.session) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

        if (refreshError || !refreshData?.session) {
          throw new Error('Authentication required. Please sign in again.');
        }
      }

      // Use the advanced contract analysis edge function
      // Note: stream: false because Supabase functions.invoke doesn't handle SSE properly
      const { data: responseData, error } = await supabase.functions.invoke('advanced-contract-analysis', {
        body: {
          text: content,
          analysisType: analysisType,
          goal: analysisType === 'general'
            ? 'Provide a comprehensive analysis of this document'
            : analysisType,
          conversationHistory: conversationHistory || [],
          ragContext: ragContext,
          stream: false // SSE streaming not supported by functions.invoke
        }
      });

      console.log('Analysis response:', { hasData: !!responseData, hasError: !!error, responseKeys: responseData ? Object.keys(responseData) : [], responseData });

      if (error) {
        console.error('Analysis request error:', error);
        throw error;
      }

      // Handle the response - extract analysis content
      let analysisContent = '';

      if (responseData) {
        if (typeof responseData === 'string') {
          analysisContent = responseData;
        } else if (typeof responseData === 'object') {
          // Try different possible response shapes
          analysisContent = responseData.analysis || responseData.content || responseData.result || '';

          // If still no content, check if the response is the raw data structure
          if (!analysisContent && responseData.choices?.[0]?.message?.content) {
            analysisContent = responseData.choices[0].message.content;
          }
        }
      }

      if (!analysisContent) {
        console.warn('No analysis content found in response:', responseData);
        analysisContent = 'Unable to extract analysis. Please try again.';
      }

      console.log('Extracted analysis content length:', analysisContent.length);

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
      toast({
        variant: 'destructive',
        title: 'Analysis Failed',
        description: error instanceof Error ? error.message : 'Failed to analyze document',
      });

      throw error;
    }
  }, [cancelStreaming, toast, streamingContent]);

  return {
    analyzeDocument: documentAnalysis.mutateAsync,
    streamAnalysis: streamDocumentAnalysis,
    cancelStreaming,
    isLoading: documentAnalysis.isPending,
    isStreaming,
    streamingContent,
    error: documentAnalysis.error
  };
}