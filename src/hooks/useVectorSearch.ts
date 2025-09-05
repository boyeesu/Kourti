import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook for performing vector similarity search on documents
 */
export function useVectorSearch(query: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['vector-search', query],
    queryFn: async () => {
      if (!query || query.trim().length < 2) {
        return { documents: [], contracts: [] };
      }

      try {
        // First generate embeddings for the search query
        const { data: embeddingData, error: embeddingError } = await supabase.functions.invoke('generate-embeddings', {
          body: {
            documentId: 'search-query',
            documentType: 'query',
            content: query
          }
        });

        if (embeddingError || !embeddingData?.embedding) {
          console.error('Failed to generate search embeddings:', embeddingError);
          return { documents: [], contracts: [] };
        }

        const searchEmbedding = embeddingData.embedding;

        // Search documents using vector similarity
        const { data: documents, error: documentsError } = await supabase
          .rpc('match_documents', {
            query_embedding: searchEmbedding,
            match_threshold: 0.3,
            match_count: 10
          });

        if (documentsError) {
          console.error('Document search error:', documentsError);
        }

        // Search contracts using vector similarity
        const { data: contracts, error: contractsError } = await supabase
          .rpc('match_contracts', {
            query_embedding: searchEmbedding,
            match_threshold: 0.3,
            match_count: 10
          });

        if (contractsError) {
          console.error('Contract search error:', contractsError);
        }

        return {
          documents: documents || [],
          contracts: contracts || []
        };

      } catch (error) {
        console.error('Vector search error:', error);
        return { documents: [], contracts: [] };
      }
    },
    enabled: enabled && !!query && query.trim().length >= 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
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