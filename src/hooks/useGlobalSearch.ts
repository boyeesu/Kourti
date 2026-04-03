import { useQuery } from '@tanstack/react-query';
import { invokeNodeApi } from '@/lib/backendApi';

export type GlobalSearchBadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export interface GlobalSearchItem {
  id: string;
  title: string;
  subtitle?: string;
  url: string;
  badge?: {
    label: string;
    variant?: GlobalSearchBadgeVariant;
  };
}

export interface GlobalSearchResults {
  cases: GlobalSearchItem[];
  documents: GlobalSearchItem[];
  contracts: GlobalSearchItem[];
  clients: GlobalSearchItem[];
  calendarEvents: GlobalSearchItem[];
  voiceRecordings: GlobalSearchItem[];
  transcriptions: GlobalSearchItem[];
}

const emptyResults: GlobalSearchResults = {
  cases: [],
  documents: [],
  contracts: [],
  clients: [],
  calendarEvents: [],
  voiceRecordings: [],
  transcriptions: [],
};

export function useGlobalSearch({
  term,
  organizationId,
  enabled = true,
}: {
  term: string;
  organizationId?: string | null;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['global-search', term, organizationId],
    enabled: Boolean(enabled && organizationId && term.trim().length >= 2),
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!organizationId || term.trim().length < 2) {
        return emptyResults;
      }

      return invokeNodeApi<GlobalSearchResults>('/api/v1/search/global', {
        query: { term },
      });
    },
  });
}
