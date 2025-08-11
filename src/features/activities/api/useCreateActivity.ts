import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CaseActivity } from '@/features/activities/types';

/**
 * Create a new activity for a given case
 */
export function useCreateActivity(caseId: string) {
  const qc = useQueryClient();
  return useMutation<CaseActivity, Error, Partial<CaseActivity>>(
    async (payload) => {
      const { data, error } = await supabase
        .from('case_activities')
        .insert({ ...payload, case_id: caseId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    {
      onSuccess: () => qc.invalidateQueries({ queryKey: ['activities', caseId] }),
    }
  );
}
