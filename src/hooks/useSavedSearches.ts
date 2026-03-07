/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { supabase } from '@/integrations/supabase/client';
import { logError } from '@/lib/logger';

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
        const { data, error } = await supabase
          .from('saved_searches' as any)
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setSavedSearches((data || []) as unknown as SavedSearch[]);
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
      const { data, error } = await supabase
        .from('saved_searches' as any)
        .insert({
          organization_id: organizationId,
          name,
          query,
          filters,
          resource_type: resourceType,
        })
        .select()
        .single();

      if (error) throw error;
      const savedSearch = data as unknown as SavedSearch;
      setSavedSearches((prev) => [savedSearch, ...prev]);
      return savedSearch;
    } catch (error) {
      logError('Error saving search', error);
      throw error;
    }
  };

  const deleteSearch = async (id: string) => {
    try {
      const { error } = await supabase
        .from('saved_searches' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;
      setSavedSearches((prev) => prev.filter((s) => s.id !== id));
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
