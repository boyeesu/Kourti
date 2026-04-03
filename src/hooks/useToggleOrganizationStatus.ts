import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invokeNodeApi } from '@/lib/backendApi';

export function useToggleOrganizationStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orgId, isActive }: { orgId: string; isActive: boolean }) => {
      return invokeNodeApi(`/api/v1/organizations/${orgId}/status`, {
        method: 'PATCH',
        body: { isActive },
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['all-organizations'] });
      toast.success(variables.isActive ? 'Organization enabled' : 'Organization disabled', {
        description: variables.isActive
          ? 'Organization has been enabled and users can access the system'
          : 'Organization has been disabled and users cannot access the system',
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to update organization status', { description: error.message });
    },
  });
}
