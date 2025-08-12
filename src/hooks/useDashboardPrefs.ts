import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type DashboardPrefs = {
  show_upcoming_cases: boolean;
  show_upcoming_contracts: boolean;
};

export function useDashboardPrefs(orgId: string) {
  const user = supabase.auth.getUser();
  const userId = user.data?.user?.id;

  return useQuery({
    queryKey: ['dashboardPrefs', orgId],
    queryFn: async () => {
      if (!userId) throw new Error('Not authenticated');
      const { data } = await supabase
        .from<DashboardPrefs & { user_id: string }>('dashboard_prefs')
        .select('*')
        .eq('user_id', userId)
        .eq('organisation_id', orgId)
        .single();
      return (
        data ?? {
          show_upcoming_cases: true,
          show_upcoming_contracts: true,
        }
      );
    },
    enabled: !!orgId && !!userId,
  });
}

export function useSaveDashboardPrefs(orgId: string) {
  const qc = useQueryClient();
  const user = supabase.auth.getUser();
  const userId = user.data?.user?.id;

  return useMutation({
    mutationFn: async (prefs: DashboardPrefs) => {
      if (!userId) throw new Error('Not authenticated');
      await supabase
        .from('dashboard_prefs')
        .upsert({ user_id: userId, organisation_id: orgId, ...prefs });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboardPrefs', orgId] });
    },
  });
}
