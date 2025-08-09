// src/features/activities/api/useActivities.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CaseActivity } from '../types';

/**
 * Fetch all activities for a given case
 */
export function useActivities(caseId: string) {
  return useQuery<CaseActivity[], Error>({
    queryKey: ['activities', caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from<CaseActivity>('case_activities')
        .select('*')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: Boolean(caseId),
    staleTime: 5 * 60 * 1000,
  });
}