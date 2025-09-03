import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GlobalRole {
  role: string;
  display_name: string;
  description?: string;
}

export function useAllRoles() {
  return useQuery({
    queryKey: ['all-roles'],
    queryFn: async () => {
      // Fetch global roles
      const { data: globals, error: globalError } = await supabase
        .from('global_roles')
        .select('*')
        .order('role');
      if (globalError) throw globalError;

      // Fetch custom roles
      const { data: customs, error: customError } = await supabase
        .from('user_roles')
        .select('*')
        .order('role_name');
      if (customError) throw customError;

      // Mark source for UI use
      const globalRoles = ((globals as any[]) || []).map((r: any) => ({
        ...r,
        source: 'global',
      }));
      const customRoles = ((customs as any[]) || []).map((r: any) => ({
        ...r,
        source: 'custom',
      }));

      // Merge for consumption
      return [...globalRoles, ...customRoles];
    },
  });
}
