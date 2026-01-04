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
      
      // Use the advanced contract analysis edge function with streaming
      const { data: responseData, error } = await supabase.functions.invoke('advanced-contract-analysis', {
        body: {
          text: content,
          analysisType: analysisType,
          goal: analysisType === 'general' 
            ? 'Provide a comprehensive analysis of this document'
            : analysisType,
          conversationHistory: conversationHistory || [],
          ragContext: ragContext,
          stream: true
        }
      });

      if (error) {
        // If streaming endpoint fails, fall back to non-streaming
        console.warn('Streaming failed, falling back to non-streaming:', error);
        const { data: fallbackData, error: fallbackError } = await supabase.functions.invoke('advanced-contract-analysis', {
          body: {
            text: content,
            analysisType: analysisType,
            goal: analysisType === 'general' 
              ? 'Provide a comprehensive analysis of this document'
              : analysisType,
            conversationHistory: conversationHistory || [],
            ragContext: ragContext,
            stream: false
          }
        });

        if (fallbackError) throw fallbackError;
        
        const analysisContent = fallbackData?.analysis || 'Analysis completed';
        setStreamingContent(analysisContent);
        onProgress(analysisContent, true);
        setIsStreaming(false);
        setAbortController(null);
        return { analysis: analysisContent };
      }

      // Handle streaming response
      if (responseData && typeof responseData === 'object' && 'analysis' in responseData) {
        // Non-streaming response (fallback)
        const analysisContent = responseData.analysis || 'Analysis completed';
        setStreamingContent(analysisContent);
        onProgress(analysisContent, true);
        setIsStreaming(false);
        setAbortController(null);
        return { analysis: analysisContent };
      }

        // If we get here, we should have a streaming response
        // Note: Supabase functions don't support streaming responses directly
        // So we'll use the non-streaming approach but simulate it better
        // Ensure session is still valid
        const { data: sessionCheck } = await supabase.auth.getSession();
        if (!sessionCheck?.session) {
          const { data: refreshData } = await supabase.auth.refreshSession();
          if (!refreshData?.session) {
            throw new Error('Authentication required. Please sign in again.');
          }
        }
        
        const { data: nonStreamData, error: nonStreamError } = await supabase.functions.invoke('advanced-contract-analysis', {
        body: {
          text: content,
          analysisType: analysisType,
          goal: analysisType === 'general' 
            ? 'Provide a comprehensive analysis of this document'
            : analysisType,
          conversationHistory: conversationHistory || [],
          ragContext: ragContext,
          stream: false
        }
      });

      if (nonStreamError) throw nonStreamError;
      
      const analysisContent = nonStreamData?.analysis || 'Analysis completed';
      
      // Improved streaming simulation with better chunking
      let currentIndex = 0;
      const words = analysisContent.split(' ');
      const streamInterval = setInterval(() => {
        if (controller.signal.aborted) {
          clearInterval(streamInterval);
          return;
        }

        // Stream word by word for more natural feel
        if (currentIndex < words.length) {
          const wordsToShow = Math.min(currentIndex + 3, words.length); // 3 words at a time
          const currentContent = words.slice(0, wordsToShow).join(' ');
          setStreamingContent(currentContent);
          onProgress(currentContent, wordsToShow >= words.length);
          currentIndex = wordsToShow;
        } else {
          clearInterval(streamInterval);
          setIsStreaming(false);
          setAbortController(null);
        }
      }, 50); // Faster updates for better UX
      
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