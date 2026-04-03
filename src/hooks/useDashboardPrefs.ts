import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeNodeApi } from '@/lib/backendApi';

export type DashboardPrefs = {
  show_upcoming_cases: boolean;
  show_upcoming_contracts: boolean;
  reminder_window_days: number;
};

export function useDashboardPrefs(orgId: string) {
  return useQuery({
    queryKey: ['dashboardPrefs', orgId],
    queryFn: async () => {
      return invokeNodeApi<DashboardPrefs>('/api/v1/misc/dashboard-prefs');
    },
    enabled: !!orgId,
  });
}

export function useSaveDashboardPrefs(orgId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (prefs: DashboardPrefs) => {
      await invokeNodeApi('/api/v1/misc/dashboard-prefs', { method: 'PUT', body: prefs });
      return;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboardPrefs', orgId] });
    },
  });
}
