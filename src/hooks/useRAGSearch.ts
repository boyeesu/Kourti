/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { logError } from '@/lib/logger';
import { invokeNodeApi } from '@/lib/backendApi';

export interface RAGSearchResult {
  chunkId: string;
  documentId?: string;
  contractId?: string;
  content: string;
  similarity: number;
  metadata: Record<string, any>;
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
        const nodeResponse = await invokeNodeApi<{
          success?: boolean;
          results?: Array<{
            id: string;
            document_id?: string;
            contract_id?: string;
            content: string;
            similarity?: number;
            metadata: Record<string, any>;
            documentName?: string;
            documentType?: 'document' | 'contract';
          }>;
        }>('/api/v1/ai/rag/search', {
          method: 'POST',
          body: {
            query,
            matchThreshold: 0.6,
            matchCount: 15,
          },
        });

        if (!nodeResponse?.success || !nodeResponse.results?.length) {
          return [];
        }

        return nodeResponse.results.map((result) => ({
          chunkId: result.id,
          documentId: result.document_id || undefined,
          contractId: result.contract_id || undefined,
          content: result.content,
          similarity: result.similarity || 0,
          metadata: result.metadata,
          documentName: result.documentName || 'Unknown Document',
          documentType: result.documentType || (result.document_id ? 'document' : 'contract'),
        }));
      } catch (error) {
        logError('RAG search error', { error });
        return [];
      }
    },
    enabled: enabled && !!query && query.trim().length >= 3,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Hook for processing a document into chunks and embeddings
 */
export function useProcessDocument() {
  return useMutation({
    mutationFn: async ({
      documentId,
      contractId,
      content,
      documentType = 'document',
    }: {
      documentId?: string;
      contractId?: string;
      content: string;
      documentType?: 'document' | 'contract';
    }) => {
      const data = await invokeNodeApi<{ chunksProcessed: number }>(
        '/api/v1/ai/rag/process-document',
        {
          method: 'POST',
          body: {
            documentId,
            contractId,
            content,
            documentType,
          },
        }
      );
      return data;
    },
    onSuccess: (data) => {
      toast.success('Document Processed', {
        description: `Successfully processed ${data.chunksProcessed} chunks for RAG search.`,
      });
    },
    onError: (error) => {
      toast.error('Processing Failed', {
        description: error instanceof Error ? error.message : 'Failed to process document',
      });
    },
  });
}
