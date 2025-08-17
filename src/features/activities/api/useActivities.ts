// src/features/activities/api/useActivities.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CaseActivity } from '@/features/activities/types';

/**
 * Fetch all activities for a given case
 */
export function useActivities(caseId: string) {
  return useQuery<CaseActivity[], Error>({
    queryKey: ['activities', caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_activities')
        .select('*')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      // Transform null values to undefined for TypeScript compatibility
      return data.map(activity => ({
        ...activity,
        description: activity.description ?? undefined,
        assigned_to: activity.assigned_to ?? undefined,
        due_date: activity.due_date ?? undefined,
        status: activity.status ?? undefined,
        created_at: activity.created_at ?? undefined,
        created_by: activity.created_by ?? undefined,
      }));
    },
    enabled: Boolean(caseId),
    staleTime: 5 * 60 * 1000,
  });
}