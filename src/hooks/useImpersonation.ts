import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { invokeNodeApi } from '@/lib/backendApi';
import { usePlatformAdmin } from './usePlatformAdmin';

export interface ImpersonationSession {
  id: string;
  admin_user_id: string;
  target_user_id: string;
  target_organization_id: string | null;
  scope: 'read' | 'write';
  reason: string;
  created_at: string;
  expires_at: string;
  admin_email: string | null;
  target_email: string | null;
  organization_name: string | null;
}

export interface StartedImpersonation {
  sessionId: string;
  token: string;
  expiresIn: number;
  target: { id: string; email: string; organizationId: string };
}

export function useActiveImpersonations() {
  const { data: isPlatformAdmin } = usePlatformAdmin();
  return useQuery({
    queryKey: ['impersonation-active'],
    enabled: !!isPlatformAdmin,
    queryFn: () => invokeNodeApi<ImpersonationSession[]>('/api/v1/admin/impersonation/active'),
    staleTime: 5 * 1000,
    refetchInterval: 15 * 1000,
  });
}

export function useStartImpersonation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { targetUserId: string; scope: 'read' | 'write'; reason: string }) =>
      invokeNodeApi<StartedImpersonation>('/api/v1/admin/impersonation/start', {
        method: 'POST',
        body: params,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['impersonation-active'] });
      toast.success('Impersonation session started');
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Failed to start impersonation'),
  });
}

export function useEndImpersonation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      invokeNodeApi(`/api/v1/admin/impersonation/${sessionId}/end`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['impersonation-active'] });
      toast.success('Session ended');
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Failed to end session'),
  });
}
