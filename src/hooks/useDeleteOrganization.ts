import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useDeleteOrganization() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ orgId, reason }: { orgId: string; reason?: string }) => {
      const { data, error } = await supabase.rpc('delete_organization_safe', {
        p_org_id: orgId,
        p_reason: reason || undefined,
      });

      if (error) throw error;

      // Check if the response contains an error
      if (data && typeof data === 'object' && 'error' in data) {
        throw new Error(data.error as string);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['platform-analytics'] });
      toast({
        title: 'Organization deleted',
        description: 'Organization and all associated data have been deleted successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to delete organization',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
