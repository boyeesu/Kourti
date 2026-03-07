import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { BulkAction } from '@/components/table/BulkToolbar';
import { useUserOrganization } from '@/hooks/useUserOrganization';

export function useBulkCaseActions() {
  const qc = useQueryClient();
  const { data: organizationId } = useUserOrganization();
  return useMutation({
    mutationFn: async ({ ids, action }: { ids: string[]; action: BulkAction }) => {
      if (!organizationId) throw new Error('Organization not found');
      if (action.type === 'delete') {
        const { error } = await supabase
          .from('cases')
          .delete()
          .in('id', ids)
          .eq('organization_id', organizationId);
        if (error) throw error;
      } else if (action.type === 'setStatus') {
        const { error } = await supabase
          .from('cases')
          .update({ status: action.status } as Record<string, unknown>)
          .in('id', ids)
          .eq('organization_id', organizationId);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cases'] }),
  });
}
