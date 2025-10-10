import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentUserId } from '@/hooks/useCurrentUser';

/**
 * Hook to fetch all role assignments for the current user
 * Returns all roles from user_role_assignments table
 */
export function useUserRoleAssignments() {
  return useQuery({
    queryKey: ['user-role-assignments'],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      if (!userId) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('user_role_assignments')
        .select(`
          id,
          role_name,
          organization_id,
          assigned_by,
          created_at
        `)
        .eq('user_id', userId);

      if (error) throw error;
      
      const roles = data?.map(r => r.role_name) || [];
      const primaryRole = roles.includes('superadmin') ? 'superadmin' 
                        : roles.includes('admin') ? 'admin'
                        : roles.includes('user') ? 'user'
                        : roles[0] || 'user';

      return {
        assignments: data || [],
        roles,
        primaryRole,
        isSuperAdmin: roles.includes('superadmin'),
        isAdmin: roles.includes('admin') || roles.includes('superadmin'),
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
