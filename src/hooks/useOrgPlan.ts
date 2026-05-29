import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invokeNodeApi } from '@/lib/backendApi';
import { logError } from '@/lib/logger';

/**
 * The plan currently assigned to an organization's members by a platform
 * admin. This is the manual / comp grant path (user_plan_assignments),
 * separate from the paid Paystack `subscriptions` row.
 */
export interface OrgPlan {
  plan_id: string;
  plan_display_name: string;
  plan_type: string;
  /** Members currently holding this assignment. */
  assigned_users: number;
  /** Total members in the org. */
  total_users: number;
  expires_at: string | null;
  assigned_at: string | null;
}

export function useOrgPlan(orgId: string | null) {
  return useQuery({
    queryKey: ['org-plan', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      try {
        return await invokeNodeApi<OrgPlan | null>(`/api/v1/admin/organizations/${orgId}/plan`);
      } catch (error) {
        logError('Error fetching org plan', error);
        return null;
      }
    },
    enabled: !!orgId,
    staleTime: 30 * 1000,
  });
}

export function useAssignOrgPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      orgId: string;
      planId: string;
      expiresAt?: string | null;
      notes?: string;
    }) => {
      return invokeNodeApi<{ assigned: number }>(
        `/api/v1/admin/organizations/${params.orgId}/assign-plan`,
        {
          method: 'POST',
          body: {
            planId: params.planId,
            expiresAt: params.expiresAt ?? null,
            notes: params.notes || undefined,
          },
        }
      );
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['org-plan', variables.orgId] });
      queryClient.invalidateQueries({ queryKey: ['org-subscriptions', variables.orgId] });
      toast.success('Plan assigned', {
        description: `Applied to ${result?.assigned ?? 0} member(s) in the organization.`,
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to assign plan', { description: error.message });
    },
  });
}

export function useRevokeOrgPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { orgId: string }) => {
      return invokeNodeApi<{ revoked: number }>(
        `/api/v1/admin/organizations/${params.orgId}/revoke-plan`,
        { method: 'POST' }
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['org-plan', variables.orgId] });
      toast.success('Plan revoked', {
        description: 'Org members no longer hold an assigned plan.',
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to revoke plan', { description: error.message });
    },
  });
}
