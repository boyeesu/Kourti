import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CreateActivityData } from './useCreateActivity';

export interface UpdateActivityData extends Partial<CreateActivityData> {
  id: string;
}

export function useUpdateActivity() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updateData }: UpdateActivityData) => {
      const { data, error } = await supabase
        .from('case_activities')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      queryClient.invalidateQueries({ queryKey: ['case-activities'] });
      queryClient.invalidateQueries({ queryKey: ['activity', data.id] });
      toast({
        title: "Success",
        description: "Activity updated successfully.",
      });
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : "Failed to update activity.";
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
    },
  });
}