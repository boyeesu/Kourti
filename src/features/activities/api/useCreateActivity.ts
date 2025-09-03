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
      const user = await supabase.auth.getUser();
      if (!user.data.user) throw new Error('User not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id' as any, user.data.user.id)
        .single();

      if (!(profile as any)?.organization_id) throw new Error('User organization not found');

      const { data, error } = await supabase
        .from('case_activities')
        .insert({ 
          ...payload, 
          case_id: caseId,
          organization_id: (profile as any).organization_id 
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activities', caseId] }),
  });
}
