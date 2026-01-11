import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useLogAdminAction } from './useAdminActions';
import { useAuth } from './useAuth';

export interface UserPlan {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  plan_type: 'free' | 'starter' | 'professional' | 'enterprise';
  features: string[];
  is_active: boolean;
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
        const { data, error } = await supabase
          .from('user_plans')
          .select('*')
          .eq('is_active', true)
          .order('plan_type', { ascending: true });

        if (error) {
          throw error;
        }

        return (data || []).map((plan) => ({
          ...plan,
          features: (plan.features as string[]) || [],
        })) as UserPlan[];
      } catch (error) {
        console.error('Error fetching user plans:', error);
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
        if (!targetUserId) {
          return null;
        }

        const { data, error } = await supabase.rpc('get_user_current_plan', {
          p_user_id: targetUserId,
        });

        if (error) {
          throw error;
        }

        if (!data || data.length === 0) {
          return null;
        }

        const plan = data[0] as CurrentUserPlan;
        return {
          ...plan,
          features: (plan.features as string[]) || [],
        };
      } catch (error) {
        console.error('Error fetching current user plan:', error);
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
        const { data, error } = await supabase.rpc('get_all_user_plan_assignments');

        if (error) {
          throw error;
        }

        return (data || []) as UserPlanAssignment[];
      } catch (error) {
        console.error('Error fetching all user plan assignments:', error);
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
  const { toast } = useToast();
  const logAction = useLogAdminAction();

  return useMutation({
    mutationFn: async (params: {
      userId: string;
      planId: string;
      expiresAt?: Date | null;
      notes?: string;
    }) => {
      try {
        const { data, error } = await supabase.rpc('assign_user_plan', {
          p_user_id: params.userId,
          p_plan_id: params.planId,
          p_expires_at: params.expiresAt?.toISOString() || null,
          p_notes: params.notes || null,
        });

        if (error) {
          throw error;
        }

        return data;
      } catch (error) {
        console.error('Error assigning user plan:', error);
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

      toast({
        title: 'Success',
        description: 'Plan assigned successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to assign plan',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to revoke a user's plan (platform admin only)
 */
export function useRevokeUserPlan() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const logAction = useLogAdminAction();

  return useMutation({
    mutationFn: async (params: { userId: string; reason?: string }) => {
      try {
        const { data, error } = await supabase.rpc('revoke_user_plan', {
          p_user_id: params.userId,
          p_reason: params.reason || null,
        });

        if (error) {
          throw error;
        }

        return data;
      } catch (error) {
        console.error('Error revoking user plan:', error);
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

      toast({
        title: 'Success',
        description: 'Plan revoked successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to revoke plan',
        variant: 'destructive',
      });
    },
  });
}
