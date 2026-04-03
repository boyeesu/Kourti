import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeNodeApi } from '@/lib/backendApi';
import { toast } from 'sonner';
import { CreateActivityData } from './useCreateActivity';

export interface UpdateActivityData extends Partial<CreateActivityData> {
  id: string;
}

export function useUpdateActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updateData }: UpdateActivityData) => {
      const data = await invokeNodeApi<Record<string, unknown>>(
        `/api/v1/misc/case-activities/${id}`,
        {
          method: 'PATCH',
          body: updateData,
        }
      );
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      queryClient.invalidateQueries({ queryKey: ['case-activities'] });
      queryClient.invalidateQueries({
        queryKey: ['activity', (data as Record<string, unknown>)?.id],
      });
      toast.success('Success', { description: 'Activity updated successfully.' });
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update activity.';
      toast.error('Error', { description: errorMessage });
    },
  });
}
