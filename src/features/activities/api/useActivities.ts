// src/features/activities/api/useActivities.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CaseActivity } from '@/features/activities/types';

/**
 * Fetch all activities for a given case
 */
export function useActivities(caseId: string) {
  return useQuery({
    queryKey: ['activities', caseId],
    queryFn: async (): Promise<CaseActivity[]> => {
      const { data, error } = await supabase
        .from('case_activities')
        .select('*')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as CaseActivity[]) || [];
    },
    enabled: Boolean(caseId),
    staleTime: 5 * 60 * 1000,
  });
}