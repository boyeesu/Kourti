import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CreateActivityData {
  title: string;
  description?: string;
  activity_type: string;
  status?: string;
  due_date?: string | null;
  assigned_to?: string | null;
}

export interface UpdateActivityData extends Partial<CreateActivityData> {
  id: string;
}

/**
 * Create a new activity for a given case
 */
export function useCreateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ caseId, payload }: { caseId: string; payload: CreateActivityData }) => {
      // Get current user's organization
      const user = await supabase.auth.getUser();
      if (!user.data.user) throw new Error('User not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.data.user.id as any)
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
    onSuccess: (_, { caseId }) => qc.invalidateQueries({ queryKey: ['activities', caseId] }),
  });
}

/**
 * Update an existing activity
 */
export function useUpdateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updateData }: UpdateActivityData) => {
      const { data, error } = await supabase
        .from('case_activities')
        .update(updateData as any)
        .eq('id', id as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['activities', data.case_id] });
    },
  });
}