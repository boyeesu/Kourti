import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook for fetching a document's full content for AI context
 */
export function useDocumentContent(documentId: string | null, documentType: 'document' | 'contract' | null) {
  return useQuery({
    queryKey: ['document-content', documentId, documentType],
    queryFn: async () => {
      if (!documentId || !documentType) {
        return null;
      }

      if (documentType === 'document') {
        const { data, error } = await supabase
          .from('documents')
          .select(`
            id,
            name,
            content,
            summary,
            terms,
            contract_type,
            effective_date,
            renewal_date,
            termination_date,
            value,
            currency,
            file_path,
            mime_type,
            metadata,
            created_at,
            updated_at
          `)
          .eq('id', documentId)
          .single();

        if (error) throw error;

        // Combine all available text content
        const fullContent = [
          data.content,
          data.summary,
          data.terms
        ].filter(Boolean).join('\n\n');

        return {
          ...data,
          fullContent,
          type: 'document' as const
        };
      } else if (documentType === 'contract') {
        const { data, error } = await supabase
          .from('contracts')
          .select(`
            id,
            title,
            description,
            contract_type,
            status,
            value,
            currency,
            start_date,
            end_date,
            terms,
            created_at,
            updated_at
          `)
          .eq('id', documentId)
          .single();

        if (error) throw error;

        // Combine all available text content
        const fullContent = [
          data.terms,
          data.description
        ].filter(Boolean).join('\n\n');

        return {
          ...data,
          fullContent,
          type: 'contract' as const
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
          // Search documents
          supabase
            .from('documents')
            .select(`
              id,
              name,
              content,
              summary,
              created_at
            `)
            .or(`name.ilike.%${searchTerm}%,content.ilike.%${searchTerm}%,summary.ilike.%${searchTerm}%`)
            .limit(10),

        // Search contracts
        supabase
          .from('contracts')
          .select(`
            id,
            title,
            description,
            terms,
            contract_type,
            created_at
          `)
          .or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,terms.ilike.%${searchTerm}%`)
          .limit(10)
      ]);

      if (documentsResult.error) throw documentsResult.error;
      if (contractsResult.error) throw contractsResult.error;

      return {
        documents: documentsResult.data || [],
        contracts: contractsResult.data || []
      };
    },
    enabled: !!searchTerm && searchTerm.length >= 2,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}