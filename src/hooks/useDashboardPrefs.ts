import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type DashboardPrefs = {
  show_upcoming_cases: boolean;
  show_upcoming_contracts: boolean;
  reminder_window_days: number;
};

export function useDashboardPrefs(orgId: string) {
  return useQuery({
    queryKey: ['dashboardPrefs', orgId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;
      if (!userId) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('dashboard_prefs')
        .select('*')
        .eq('user_id', userId as any)
        .eq('organization_id', orgId as any)
        .maybeSingle();

      if (error) throw error;
      return (
        data ?? {
          show_upcoming_cases: true,
          show_upcoming_contracts: true,
          reminder_window_days: 90,
        }
      );
    },
    enabled: !!orgId,
  });
}

export function useSaveDashboardPrefs(orgId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (prefs: DashboardPrefs) => {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;
      if (!userId) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('dashboard_prefs')
        .upsert({ user_id: userId, organization_id: orgId, ...prefs } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboardPrefs', orgId] });
    },
  });
}
