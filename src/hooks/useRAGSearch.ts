import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface RAGSearchResult {
  chunkId: string;
  documentId?: string;
  contractId?: string;
  content: string;
  similarity: number;
  metadata: any;
  documentName?: string;
  documentType?: 'document' | 'contract';
}

/**
 * Hook for performing RAG-based search using document chunks and embeddings
 */
export function useRAGSearch(query: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['rag-search', query],
    queryFn: async (): Promise<RAGSearchResult[]> => {
      if (!query || query.trim().length < 3) {
        return [];
      }

      try {
        // Step 1: Generate embedding for the query
        const { data: embeddingData, error: embeddingError } = await supabase.functions.invoke('generate-embeddings', {
          body: {
            documentId: 'query',
            documentType: 'query',
            content: query
          }
        });

        if (embeddingError) {
          console.error('Failed to generate query embedding:', embeddingError);
          // Fall back to text search
          return performTextFallbackSearch(query);
        }

        if (!embeddingData?.embedding) {
          console.warn('No embedding returned, falling back to text search');
          return performTextFallbackSearch(query);
        }

        // Step 2: For now, fall back to text search until we fix the vector function
        console.log('Vector function not yet available, using text search');
        return performTextFallbackSearch(query);

        /*
        // TODO: Enable this when vector function is working
        const { data: searchData, error: searchError } = await supabase.rpc(
          'match_document_chunks',
          {
            query_embedding: embeddingData.embedding,
            match_threshold: 0.7,
            match_count: 10
          }
        );

        if (searchError) {
          console.error('Vector search error:', searchError);
          return performTextFallbackSearch(query);
        }

        if (!searchData || searchData.length === 0) {
          console.log('No vector search results, trying text fallback');
          return performTextFallbackSearch(query);
        }

        // TODO: Enable this when vector function is working
        const enrichedResults: RAGSearchResult[] = [];
        console.log(`Found ${enrichedResults.length} RAG search results`);
        return enrichedResults;
        */

      } catch (error) {
        console.error('RAG search error:', error);
        return performTextFallbackSearch(query);
      }
    },
    enabled: enabled && !!query && query.trim().length >= 3,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Fallback text search when vector search is unavailable
async function performTextFallbackSearch(query: string): Promise<RAGSearchResult[]> {
  try {
    console.log('Performing fallback text search');
    
    // Search document chunks with text search
    const { data: chunkResults, error: chunkError } = await supabase
      .from('document_chunks')
      .select(`
        id,
        document_id,
        contract_id,
        content,
        metadata
      `)
      .ilike('content', `%${query}%`)
      .limit(10);

    if (chunkError) {
      console.error('Chunk text search error:', chunkError);
      return [];
    }

    // Transform to RAGSearchResult format
    const results: RAGSearchResult[] = [];
    
    for (const chunk of chunkResults || []) {
      let documentName = 'Unknown Document';
      let documentType: 'document' | 'contract' = 'document';
      
      if (chunk.document_id) {
        const { data: docData } = await supabase
          .from('documents')
          .select('name')
          .eq('id', chunk.document_id)
          .single();
        
        documentName = docData?.name || 'Unknown Document';
        documentType = 'document';
      } else if (chunk.contract_id) {
        const { data: contractData } = await supabase
          .from('contracts')
          .select('title')
          .eq('id', chunk.contract_id)
          .single();
        
        documentName = contractData?.title || 'Unknown Contract';
        documentType = 'contract';
      }
      
      results.push({
        chunkId: chunk.id,
        documentId: chunk.document_id || undefined,
        contractId: chunk.contract_id || undefined,
        content: chunk.content,
        similarity: 0.75, // Default similarity for text search
        metadata: chunk.metadata,
        documentName,
        documentType
      });
    }

    console.log(`Fallback text search found ${results.length} results`);
    return results;

  } catch (error) {
    console.error('Fallback search error:', error);
    return [];
  }
}

/**
 * Hook for processing a document into chunks and embeddings
 */
export function useProcessDocument() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      documentId,
      contractId,
      content,
      organizationId,
      documentType = 'document'
    }: {
      documentId?: string;
      contractId?: string;
      content: string;
      organizationId: string;
      documentType?: 'document' | 'contract';
    }) => {
      const { data, error } = await supabase.functions.invoke('process-document-chunks', {
        body: {
          documentId,
          contractId,
          content,
          organizationId,
          documentType
        }
      });

      if (error) {
        throw new Error(`Failed to process document: ${error.message}`);
      }

      return data;
    },
    onSuccess: (data) => {
      toast({
        title: 'Document Processed',
        description: `Successfully processed ${data.chunksProcessed} chunks for RAG search.`,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Processing Failed',
        description: error instanceof Error ? error.message : 'Failed to process document',
      });
    }
  });
}