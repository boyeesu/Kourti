/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { logError } from '@/lib/logger';
import { invokeNodeApi } from '@/lib/backendApi';

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  filters: Record<string, any>;
  resource_type: 'cases' | 'documents' | 'clients' | 'contracts';
  created_at: string;
}

export function useSavedSearches() {
  const { data: organizationId } = useUserOrganization();
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;

    const fetchSearches = async () => {
      try {
        const data = await invokeNodeApi<SavedSearch[]>('/api/v1/misc/saved-searches');
        setSavedSearches(data || []);
        setIsLoading(false);
        return;
      } catch (error) {
        logError('Error fetching saved searches', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSearches();
  }, [organizationId]);

  const saveSearch = async (
    name: string,
    query: string,
    filters: Record<string, any>,
    resourceType: SavedSearch['resource_type']
  ) => {
    if (!organizationId) return;

    try {
      const savedSearch = await invokeNodeApi<SavedSearch>('/api/v1/misc/saved-searches', {
        method: 'POST',
        body: { name, query, filters, resource_type: resourceType },
      });
      setSavedSearches((prev) => [savedSearch, ...prev]);
      return savedSearch;
    } catch (error) {
      logError('Error saving search', error);
      throw error;
    }
  };

  const deleteSearch = async (id: string) => {
    try {
      await invokeNodeApi(`/api/v1/misc/saved-searches/${id}`, { method: 'DELETE' });
      setSavedSearches((prev) => prev.filter((s) => s.id !== id));
      return;
    } catch (error) {
      logError('Error deleting search', error);
      throw error;
    }
  };

  return {
    savedSearches,
    isLoading,
    saveSearch,
    deleteSearch,
  };
}
