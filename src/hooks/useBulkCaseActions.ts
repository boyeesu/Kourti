import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BulkAction } from '@/components/table/BulkToolbar';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { invokeNodeApi } from '@/lib/backendApi';

export function useBulkCaseActions() {
  const qc = useQueryClient();
  const { data: organizationId } = useUserOrganization();
  return useMutation({
    mutationFn: async ({ ids, action }: { ids: string[]; action: BulkAction }) => {
      if (!organizationId) throw new Error('Organization not found');

      await invokeNodeApi('/api/v1/misc/bulk/cases', { method: 'POST', body: { ids, action } });
      return;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cases'] }),
  });
}
