import { useRAGSearch } from './useRAGSearch';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook for performing vector similarity search on documents
 * Now uses the new RAG search with document chunks
 */
export function useVectorSearch(query: string, enabled: boolean = true) {
  // Use the new RAG search instead of the old vector search
  const { data: ragResults, ...rest } = useRAGSearch(query, enabled);

  return {
    ...rest,
    queryKey: ['vector-search', query],
    data: ragResults ? {
      documents: ragResults
        .filter(result => result.documentType === 'document')
        .map(result => ({
          id: result.documentId,
          name: result.documentName,
          content: result.content,
          summary: result.content.substring(0, 200) + '...',
          similarity: result.similarity,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })),
      contracts: ragResults
        .filter(result => result.documentType === 'contract')
        .map(result => ({
          id: result.contractId,
          title: result.documentName,
          description: result.content.substring(0, 200) + '...',
          terms: result.content,
          similarity: result.similarity,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }))
    } : { documents: [], contracts: [] }
  };
}

/**
 * Hook for generating embeddings for a document
 */
export function useGenerateEmbedding() {
  return async (documentId: string, documentType: 'document' | 'contract', content: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('generate-embeddings', {
        body: {
          documentId,
          documentType,
          content
        }
      });

      if (error) {
        throw new Error(`Failed to generate embedding: ${error.message}`);
      }

      return data;
    } catch (error: any) {
      console.error('Embedding generation error:', error);
      throw error;
    }
  };
}