import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from './useAuth';
import { usePlatformAdmin } from './usePlatformAdmin';
import { logError } from '@/lib/logger';
import { invokeNodeApi } from '@/lib/backendApi';

type QueryValue = string | number | boolean | null | undefined;

export interface AdminAction {
  id: string;
  admin_user_id: string;
  action_type: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface AdminActionFilters {
  admin_user_id?: string;
  action_type?: string;
  target_type?: string;
  start_date?: string;
  end_date?: string;
}

/**
 * Hook to fetch admin actions with optional filters
 */
export function useAdminActions(filters?: AdminActionFilters) {
  const { data: isPlatformAdmin } = usePlatformAdmin();
  return useQuery({
    queryKey: ['admin-actions', filters],
    enabled: !!isPlatformAdmin,
    queryFn: async () => {
      try {
        return invokeNodeApi<AdminAction[]>('/api/v1/admin/actions', {
          query: (filters || {}) as Record<string, QueryValue>,
        });
      } catch (error) {
        logError('Error fetching admin actions', error);
        throw error;
      }
    },
    staleTime: 10 * 1000, // Cache for 10 seconds
  });
}

/**
 * Hook to log an admin action
 */
export function useLogAdminAction() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      action_type: string;
      target_type: string;
      target_id?: string;
      details?: Record<string, unknown>;
    }) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      try {
        // Get IP and user agent from browser
        const userAgent = navigator.userAgent;

        return invokeNodeApi('/api/v1/admin/actions', {
          method: 'POST',
          body: {
            action_type: params.action_type,
            target_type: params.target_type,
            target_id: params.target_id,
            details: params.details || {},
            user_agent: userAgent,
          },
        });
      } catch (error) {
        logError('Error logging admin action', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-actions'] });
    },
    onError: (error) => {
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to log admin action',
      });
    },
  });
}
