/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { invokeNodeApi } from '@/lib/backendApi';

/**
 * Hook to create a default organization for a user if they don't have one.
 * This can be used as a fallback when organization ID is missing.
 */
export function useCreateDefaultOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (organizationName?: string) => {
      const userId = await getCurrentUserId();

      if (!userId) {
        throw new Error('User is not authenticated. Please sign in first.');
      }

      // In Node mode, delegate org creation to the backend
      return invokeNodeApi<any>('/api/v1/organizations/create-default', {
        method: 'POST',
        body: { name: organizationName || 'My Legal Practice' },
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['user-organization'] });
      toast.success('Organization Created', {
        description: `'${(data as any)?.name || 'Organization'}' has been created. Please sign in again to continue.`,
      });
    },
    onError: (error: any) => {
      toast.error('Error', { description: error.message || 'Failed to create organization.' });
    },
  });
}
