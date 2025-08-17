import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CaseActivity } from '@/features/activities/types';

/**
 * Create a new activity for a given case
 */
export function useCreateActivity(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<CaseActivity> & { title: string; activity_type: string }) => {
      // Get current user's organization
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      const { data, error } = await supabase
        .from('case_activities')
        .insert({ 
          ...payload, 
          case_id: caseId,
          organization_id: profile?.organization_id 
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activities', caseId] }),
  });
}
