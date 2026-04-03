import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invokeNodeApi } from '@/lib/backendApi';

export function useDeleteOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orgId, reason }: { orgId: string; reason?: string }) => {
      return invokeNodeApi(`/api/v1/organizations/${orgId}`, {
        method: 'DELETE',
        body: { reason },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['platform-analytics'] });
      toast.success('Organization deleted', {
        description: 'Organization and all associated data have been deleted successfully',
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to delete organization', { description: error.message });
    },
  });
}
