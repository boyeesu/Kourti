import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useToggleOrganizationStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ orgId, isActive }: { orgId: string; isActive: boolean }) => {
      const { data, error } = await supabase.rpc('toggle_organization_status', {
        p_org_id: orgId,
        p_is_active: isActive,
      });

      if (error) throw error;

      // Check if the response contains an error
      if (data && typeof data === 'object' && 'error' in data) {
        throw new Error(data.error as string);
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['all-organizations'] });
      toast({
        title: variables.isActive ? 'Organization enabled' : 'Organization disabled',
        description: variables.isActive
          ? 'Organization has been enabled and users can access the system'
          : 'Organization has been disabled and users cannot access the system',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to update organization status',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
