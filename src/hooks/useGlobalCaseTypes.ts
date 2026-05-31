import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { invokeNodeApi } from '@/lib/backendApi';
import { logError } from '@/lib/logger';

import { usePlatformAdmin } from './usePlatformAdmin';

export interface GlobalCaseType {
  id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  is_global: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaseTypeUpsertInput {
  name?: string;
  description?: string | null;
  is_active?: boolean;
}

const CASE_TYPES_KEY = ['admin-global-case-types'];

export function useGlobalCaseTypes() {
  const { data: isPlatformAdmin } = usePlatformAdmin();
  return useQuery({
    queryKey: CASE_TYPES_KEY,
    enabled: !!isPlatformAdmin,
    queryFn: async () => {
      try {
        return await invokeNodeApi<GlobalCaseType[]>('/api/v1/admin/case-types');
      } catch (error) {
        logError('Error fetching global case types', error);
        throw error;
      }
    },
    staleTime: 30 * 1000,
  });
}

export function useCreateGlobalCaseType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CaseTypeUpsertInput & { name: string; reason: string }) =>
      invokeNodeApi<GlobalCaseType>('/api/v1/admin/case-types', { method: 'POST', body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CASE_TYPES_KEY });
      queryClient.invalidateQueries({ queryKey: ['caseTypes'] });
      toast.success('Case type created');
    },
    onError: (error) =>
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to create case type',
      }),
  });
}

export function useUpdateGlobalCaseType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: CaseTypeUpsertInput & { id: string; reason: string }) =>
      invokeNodeApi<GlobalCaseType>(`/api/v1/admin/case-types/${id}`, {
        method: 'PUT',
        body: input,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CASE_TYPES_KEY });
      queryClient.invalidateQueries({ queryKey: ['caseTypes'] });
      toast.success('Case type updated');
    },
    onError: (error) =>
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to update case type',
      }),
  });
}

export function useDeleteGlobalCaseType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      invokeNodeApi<{ ok: boolean }>(`/api/v1/admin/case-types/${id}`, {
        method: 'DELETE',
        body: { reason },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CASE_TYPES_KEY });
      queryClient.invalidateQueries({ queryKey: ['caseTypes'] });
      toast.success('Case type deleted');
    },
    onError: (error) =>
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to delete case type',
      }),
  });
}
