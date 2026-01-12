import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logError, logInfo, logWarn } from '@/lib/logger';
import { invokeFunctionWithCsrf } from '@/lib/csrfClient';

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
        // Ensure we have an active session
        const { data: sessionData } = await supabase.auth.getSession();

        if (!sessionData?.session) {
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

          if (refreshError || !refreshData?.session) {
            logWarn('No active session for RAG search, using text fallback');
            return performTextFallbackSearch(query);
          }
        }

        // Use the dedicated rag-search edge function
        logInfo('Performing RAG search via edge function');

        const { data: searchResponse, error: searchError } = await supabase.functions.invoke('rag-search', {
          body: {
            query: query,
            matchThreshold: 0.6,
            matchCount: 15
          }
        });

        if (searchError) {
          logError('RAG search edge function error', { error: searchError });
          return performTextFallbackSearch(query);
        }

        if (!searchResponse?.success || !searchResponse?.results || searchResponse.results.length === 0) {
          logInfo('No RAG results found via edge function', { message: searchResponse?.message });
          return performTextFallbackSearch(query);
        }

        // Transform edge function results to RAGSearchResult format
        const enrichedResults: RAGSearchResult[] = searchResponse.results.map((result: any) => ({
          chunkId: result.id,
          documentId: result.document_id || undefined,
          contractId: result.contract_id || undefined,
          content: result.content,
          similarity: result.similarity || 0,
          metadata: result.metadata,
          documentName: result.documentName || 'Unknown Document',
          documentType: result.documentType || (result.document_id ? 'document' : 'contract')
        }));

        logInfo('RAG search completed', { resultCount: enrichedResults.length });
        return enrichedResults;

      } catch (error) {
        logError('RAG search error', { error });
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
      logError('Chunk text search error', { error: chunkError });
      return [];
    }

    // Transform to RAGSearchResult format
    const results: RAGSearchResult[] = [];
    const documentIds = Array.from(new Set((chunkResults || [])
      .map((chunk) => chunk.document_id)
      .filter(Boolean))) as string[];

    const contractIds = Array.from(new Set((chunkResults || [])
      .map((chunk) => chunk.contract_id)
      .filter(Boolean))) as string[];

    const [documentsResponse, contractsResponse] = await Promise.all([
      documentIds.length
        ? supabase.from('documents').select('id, name').in('id', documentIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
      contractIds.length
        ? supabase.from('contracts').select('id, title').in('id', contractIds)
        : Promise.resolve({ data: [] as { id: string; title: string }[], error: null })
    ]);

    if (documentsResponse.error) {
      logWarn('Unable to load document names for fallback search', { error: documentsResponse.error });
    }

    if (contractsResponse.error) {
      logWarn('Unable to load contract names for fallback search', { error: contractsResponse.error });
    }

    const documentNameMap = new Map<string, string>(
      (documentsResponse.data || []).map((doc) => [doc.id, doc.name || 'Unknown Document'])
    );
    const contractNameMap = new Map<string, string>(
      (contractsResponse.data || []).map((contract) => [contract.id, contract.title || 'Unknown Contract'])
    );

    for (const chunk of chunkResults || []) {
      const hasDocument = Boolean(chunk.document_id);
      const documentName = hasDocument
        ? documentNameMap.get(chunk.document_id as string) || 'Unknown Document'
        : contractNameMap.get(chunk.contract_id as string) || 'Unknown Contract';
      const documentType: 'document' | 'contract' = hasDocument ? 'document' : 'contract';

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

    logInfo('Fallback text search completed', { resultCount: results.length });
    return results;

  } catch (error) {
    logError('Fallback search error', { error });
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
      documentType = 'document'
    }: {
      documentId?: string;
      contractId?: string;
      content: string;
      documentType?: 'document' | 'contract';
    }) => {
      // Ensure we have an active session - Supabase client should automatically include auth header
      const { data: sessionData } = await supabase.auth.getSession();

      if (!sessionData?.session) {
        // Try to refresh the session if it's missing
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

        if (refreshError || !refreshData?.session) {
          logError('No active session for document processing', { refreshError });
          throw new Error(`Authentication required. Please sign in again.`);
        }
      }

      // Supabase client automatically includes Authorization header with session token
      const { data, error } = await invokeFunctionWithCsrf('process-document-chunks', {
        body: {
          documentId,
          contractId,
          content,
          documentType
        }
      });

      if (error) {
        logError('Failed to process document chunks', { error, documentId, contractId });
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