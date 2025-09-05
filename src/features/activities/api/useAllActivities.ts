// src/features/activities/api/useAllActivities.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { CaseActivity } from '@/features/activities/types';

/**
 * Fetch all activities for the current user's organization
 */
export function useAllActivities() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['activities', 'all', user?.id],
    queryFn: async (): Promise<CaseActivity[]> => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      // Get user's organization
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (profileError) throw profileError;

      if (!profile?.organization_id) {
        throw new Error('User organization not found');
      }

      // Fetch all activities for the organization
      const { data, error } = await supabase
        .from('case_activities')
        .select(`
          *,
          cases!inner(client_id, title as case_title)
        `)
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as unknown as CaseActivity[]) || [];
    },
    enabled: Boolean(user?.id),
    staleTime: 5 * 60 * 1000,
  });
}