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
        // Call the advanced contract analysis edge function with GPT-4
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

  // Streaming document analysis
  const streamDocumentAnalysis = useCallback(async ({
    content,
    analysisType = 'general',
    onProgress
  }: {
    content: string;
    analysisType?: 'general' | 'risk' | 'summary' | 'extract' | 'compare';
    onProgress: (content: string, done: boolean) => void;
  }) => {
    // Cancel any existing stream
    cancelStreaming();
    
    try {
      setIsStreaming(true);
      setStreamingContent('');
      
      // Create a new abort controller for this request
      const controller = new AbortController();
      setAbortController(controller);
      
      // Use the advanced contract analysis edge function with GPT-4
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
      
      const analysisContent = data?.analysis || 'Analysis completed';
      
      // Simulate streaming by gradually revealing the content
      let currentIndex = 0;
      const streamInterval = setInterval(() => {
        if (controller.signal.aborted) {
          clearInterval(streamInterval);
          return;
        }

        const chunkSize = Math.max(1, Math.floor(analysisContent.length / 20));
        currentIndex = Math.min(currentIndex + chunkSize, analysisContent.length);
        
        const currentContent = analysisContent.substring(0, currentIndex);
        setStreamingContent(currentContent);
        onProgress(currentContent, currentIndex >= analysisContent.length);
        
        if (currentIndex >= analysisContent.length) {
          clearInterval(streamInterval);
          setIsStreaming(false);
          setAbortController(null);
        }
      }, 100);
      
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