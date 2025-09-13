import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GlobalRole {
  role: string;
  display_name: string;
  description?: string;
}

export interface CustomRole {
  id: string;
  role_name: string;
  description?: string;
  organization_id: string;
}

export function useAllRoles() {
  return useQuery({
    queryKey: ['all-roles'],
    queryFn: async () => {
      try {
        // Fetch global roles
        const { data: globals, error: globalError } = await supabase
          .from('global_roles')
          .select('*')
          .order('role');
        if (globalError) throw globalError;

        // Fetch custom roles for current organization
        const { data: customs, error: customError } = await supabase
          .from('user_roles')
          .select('*')
          .order('role_name');
        if (customError && customError.code !== 'PGRST116') throw customError;

        // Mark source and normalize field names for UI use
        const globalRoles = ((globals as GlobalRole[]) || []).map((r) => ({
          id: r.role,
          role: r.role,
          role_name: r.role,
          display_name: r.display_name,
          description: r.description,
          source: 'global' as const,
        }));

        const customRoles = ((customs as CustomRole[]) || []).map((r) => ({
          id: r.id,
          role: r.role_name,
          role_name: r.role_name,
          display_name: r.role_name,
          description: r.description,
          source: 'custom' as const,
        }));

        // Merge for consumption
        return [...globalRoles, ...customRoles];
      } catch (error) {
        console.warn('Error fetching roles, returning system defaults:', error);
        // Return system defaults if there's an error
        return [
          { id: 'superadmin', role: 'superadmin', role_name: 'superadmin', display_name: 'Super Administrator', source: 'global' as const },
          { id: 'admin', role: 'admin', role_name: 'admin', display_name: 'Administrator', source: 'global' as const },
          { id: 'user', role: 'user', role_name: 'user', display_name: 'User', source: 'global' as const },
        ];
      }
    },
  });
}
