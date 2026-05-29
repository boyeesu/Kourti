import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useLogAdminAction } from './useAdminActions';
import { useAuth } from './useAuth';
import { logError } from '@/lib/logger';
import { invokeNodeApi } from '@/lib/backendApi';

export interface UserPlan {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  plan_type: 'free' | 'starter' | 'professional' | 'enterprise';
  features: string[];
  is_active: boolean;
  // Null for plans with no fixed price (e.g. Enterprise — sold via contract).
  price_monthly: number | null;
  price_yearly: number | null;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface UserPlanAssignment {
  assignment_id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  plan_id: string;
  plan_name: string;
  plan_display_name: string;
  plan_type: string;
  assigned_by: string;
  assigned_by_email: string;
  starts_at: string;
  expires_at: string | null;
  status: 'active' | 'expired' | 'revoked';
  notes: string | null;
  created_at: string;
}

export interface CurrentUserPlan {
  assignment_id: string;
  plan_id: string;
  plan_name: string;
  plan_display_name: string;
  plan_type: string;
  features: string[];
  starts_at: string;
  expires_at: string | null;
  status: string;
}

/**
 * Hook to fetch all available plans
 */
export function useUserPlans() {
  return useQuery({
    queryKey: ['user-plans'],
    queryFn: async () => {
      try {
        return invokeNodeApi<UserPlan[]>('/api/v1/misc/user-plans');
      } catch (error) {
        logError('Error fetching user plans', error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

/**
 * Hook to fetch current user's plan
 */
export function useCurrentUserPlan(userId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['current-user-plan', userId || user?.id],
    queryFn: async () => {
      try {
        const targetUserId = userId || user?.id;
        if (!targetUserId) return null;

        return invokeNodeApi<CurrentUserPlan | null>('/api/v1/misc/user-plans/current');
      } catch (error) {
        logError('Error fetching current user plan', error);
        throw error;
      }
    },
    enabled: !!userId || !!user?.id,
    staleTime: 1 * 60 * 1000, // Cache for 1 minute
  });
}

/**
 * Hook to fetch all user plan assignments (platform admin only)
 */
export function useAllUserPlanAssignments() {
  return useQuery({
    queryKey: ['all-user-plan-assignments'],
    queryFn: async () => {
      try {
        return invokeNodeApi<UserPlanAssignment[]>('/api/v1/admin/user-plan-assignments');
      } catch (error) {
        logError('Error fetching all user plan assignments', error);
        throw error;
      }
    },
    staleTime: 30 * 1000, // Cache for 30 seconds
  });
}

/**
 * Hook to assign a plan to a user (platform admin only)
 */
export function useAssignUserPlan() {
  const queryClient = useQueryClient();

  const logAction = useLogAdminAction();

  return useMutation({
    mutationFn: async (params: {
      userId: string;
      planId: string;
      expiresAt?: Date | null;
      notes?: string;
    }) => {
      try {
        return invokeNodeApi<unknown>('/api/v1/admin/user-plans/assign', {
          method: 'POST',
          body: {
            userId: params.userId,
            planId: params.planId,
            expiresAt: params.expiresAt?.toISOString() || null,
            notes: params.notes || null,
          },
        });
      } catch (error) {
        logError('Error assigning user plan', error);
        throw error;
      }
    },
    onSuccess: async (_, params) => {
      queryClient.invalidateQueries({ queryKey: ['all-user-plan-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['current-user-plan', params.userId] });
      queryClient.invalidateQueries({ queryKey: ['all-users'] });

      await logAction.mutateAsync({
        action_type: 'user_plan_assigned',
        target_type: 'user',
        target_id: params.userId,
        details: {
          user_id: params.userId,
          plan_id: params.planId,
          expires_at: params.expiresAt?.toISOString(),
          notes: params.notes,
        },
      });

      toast.success('Success', { description: 'Plan assigned successfully' });
    },
    onError: (error) => {
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to assign plan',
      });
    },
  });
}

/**
 * Hook to revoke a user's plan (platform admin only)
 */
export function useRevokeUserPlan() {
  const queryClient = useQueryClient();

  const logAction = useLogAdminAction();

  return useMutation({
    mutationFn: async (params: { userId: string; reason?: string }) => {
      try {
        return invokeNodeApi<unknown>('/api/v1/admin/user-plans/revoke', {
          method: 'POST',
          body: {
            userId: params.userId,
            reason: params.reason || null,
          },
        });
      } catch (error) {
        logError('Error revoking user plan', error);
        throw error;
      }
    },
    onSuccess: async (_, params) => {
      queryClient.invalidateQueries({ queryKey: ['all-user-plan-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['current-user-plan', params.userId] });
      queryClient.invalidateQueries({ queryKey: ['all-users'] });

      await logAction.mutateAsync({
        action_type: 'user_plan_revoked',
        target_type: 'user',
        target_id: params.userId,
        details: {
          user_id: params.userId,
          reason: params.reason,
        },
      });

      toast.success('Success', { description: 'Plan revoked successfully' });
    },
    onError: (error) => {
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to revoke plan',
      });
    },
  });
}
