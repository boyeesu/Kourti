import { useQuery } from '@tanstack/react-query';
import { invokeNodeApi } from '@/lib/backendApi';

type ContextDocumentsResponse = {
  documents: Array<Record<string, unknown>>;
  count: number;
};

type ContextContractsResponse = {
  contracts: Array<Record<string, unknown>>;
  count: number;
};

/**
 * Hook for fetching a document's full content for AI context
 */
export function useDocumentContent(
  documentId: string | null,
  documentType: 'document' | 'contract' | null
) {
  return useQuery({
    queryKey: ['document-content', documentId, documentType],
    queryFn: async () => {
      if (!documentId || !documentType) {
        return null;
      }

      if (documentType === 'document') {
        const data = await invokeNodeApi<{
          id: string;
          name: string;
          content?: string;
          summary?: string;
          terms?: string;
          contract_type?: string;
          effective_date?: string;
          renewal_date?: string;
          termination_date?: string;
          value?: number;
          currency?: string;
          file_path?: string;
          mime_type?: string;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        }>(`/api/v1/documents/${documentId}`);

        const fullContent = [data.content, data.summary, data.terms].filter(Boolean).join('\n\n');

        return {
          ...data,
          fullContent,
          type: 'document' as const,
        };
      } else if (documentType === 'contract') {
        const data = await invokeNodeApi<{
          id: string;
          title: string;
          description?: string;
          contract_type?: string;
          status?: string;
          value?: number;
          currency?: string;
          start_date?: string;
          end_date?: string;
          terms?: string;
          created_at?: string;
          updated_at?: string;
        }>(`/api/v1/contracts/${documentId}`);

        const fullContent = [data.terms, data.description].filter(Boolean).join('\n\n');

        return {
          ...data,
          fullContent,
          type: 'contract' as const,
        };
      }

      return null;
    },
    enabled: !!documentId && !!documentType,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook for searching documents and contracts for AI context
 */
export function useSearchDocumentsForContext(searchTerm: string) {
  return useQuery({
    queryKey: ['search-documents-context', searchTerm],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) {
        return { documents: [], contracts: [] };
      }

      const [documentsResult, contractsResult] = await Promise.all([
        invokeNodeApi<ContextDocumentsResponse>('/api/v1/documents', {
          query: {
            page: 1,
            pageSize: 10,
            search: searchTerm,
          },
        }),
        invokeNodeApi<ContextContractsResponse>('/api/v1/contracts', {
          query: {
            page: 1,
            pageSize: 10,
            search: searchTerm,
          },
        }),
      ]);

      return {
        documents: documentsResult.documents || [],
        contracts: contractsResult.contracts || [],
      };
    },
    enabled: !!searchTerm && searchTerm.length >= 2,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}
