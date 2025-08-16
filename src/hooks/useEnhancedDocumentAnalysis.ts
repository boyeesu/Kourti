import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { addCSRFToRequest } from '@/lib/csrf';
import { logError } from '@/lib/logger';

// Use Supabase Edge Function instead of external API
const DOCUMENT_ANALYSIS_FUNCTION = 'analyze-document';

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
      docId, 
      content, 
      documentType = 'document',
      analysisType = 'general'
    }: { 
      docId: string; 
      content: string;
      documentType?: 'document' | 'contract' | 'case' | 'email';
      analysisType?: 'general' | 'risk' | 'summary' | 'extract' | 'compare';
    }) => {
      try {
        // Get user and organization info for context
        const { data: { user } } = await supabase.auth.getUser();
        const { data: profile } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('user_id', user?.id)
          .single();
          
        // Use Supabase Edge Function
        const { data, error } = await supabase.functions.invoke(DOCUMENT_ANALYSIS_FUNCTION, {
          body: {
            documentId: docId,
            content,
            documentType,
            analysisType,
            userId: user?.id,
            organizationId: profile?.organization_id
          }
        });

        if (error) throw error;
        return data;
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
    docId,
    content,
    documentType = 'document',
    analysisType = 'general',
    onProgress
  }: {
    docId: string;
    content: string;
    documentType?: 'document' | 'contract' | 'case' | 'email';
    analysisType?: 'general' | 'risk' | 'summary' | 'extract' | 'compare';
    onProgress: (content: string, done: boolean) => void;
  }) => {
    // Cancel any existing stream
    cancelStreaming();
    
    try {
      setIsStreaming(true);
      setStreamingContent('');
      
      // Get user and organization info for context
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user?.id)
        .single();
      
      // Create a new abort controller for this request
      const controller = new AbortController();
      setAbortController(controller);
      
      // Use Supabase Edge Function with streaming
      const response = await supabase.functions.invoke(`${DOCUMENT_ANALYSIS_FUNCTION}-stream`, {
        body: {
          documentId: docId,
          content,
          documentType,
          analysisType,
          userId: user?.id,
          organizationId: profile?.organization_id,
          stream: true
        },
        // Use AbortController signal
        signal: controller.signal,
        // Enable response streaming
        responseType: 'stream'
      });

      if (response.error) throw response.error;
      
      // Handle the streaming response
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Response body is not readable');
      
      let accumulatedContent = '';
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          onProgress(accumulatedContent, true);
          setIsStreaming(false);
          setAbortController(null);
          break;
        }
        
        // Decode the chunk and add to our accumulated content
        const chunk = decoder.decode(value, { stream: true });
        accumulatedContent += chunk;
        setStreamingContent(accumulatedContent);
        
        // Call the progress callback
        onProgress(accumulatedContent, false);
      }
      
      return { analysis: accumulatedContent };
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