import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeNodeApi } from '@/lib/backendApi';
import { toast } from 'sonner';

export function useDeleteActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (activityId: string) => {
      await invokeNodeApi(`/api/v1/misc/case-activities/${activityId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      queryClient.invalidateQueries({ queryKey: ['case-activities'] });
      toast.success('Success', { description: 'Activity deleted successfully.' });
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete activity.';
      toast.error('Error', { description: errorMessage });
    },
  });
}
