import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from './useAuth';
import { usePlatformAdmin } from './usePlatformAdmin';
import type { Json } from '@/integrations/supabase/types';
import { logError } from '@/lib/logger';

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
        let query = supabase
          .from('admin_actions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1000);

        if (filters?.admin_user_id) {
          query = query.eq('admin_user_id', filters.admin_user_id);
        }
        if (filters?.action_type) {
          query = query.eq('action_type', filters.action_type);
        }
        if (filters?.target_type) {
          query = query.eq('target_type', filters.target_type);
        }
        if (filters?.start_date) {
          query = query.gte('created_at', filters.start_date);
        }
        if (filters?.end_date) {
          query = query.lte('created_at', filters.end_date);
        }

        const { data, error } = await query;

        if (error) {
          throw error;
        }

        return (data || []) as AdminAction[];
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

        const { data, error } = await supabase.rpc('log_admin_action', {
          p_action_type: params.action_type,
          p_target_type: params.target_type,
          p_target_id: params.target_id || undefined,
          p_details: (params.details || {}) as Json,
          p_ip_address: undefined, // IP will be captured by backend
          p_user_agent: userAgent,
        });

        if (error) {
          throw error;
        }

        return data;
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
