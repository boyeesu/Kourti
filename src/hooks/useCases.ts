import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { Case } from '@/types';
import { invokeNodeApi } from '@/lib/backendApi';

export interface CreateCaseData {
  title: string;
  description?: string;
  client_id?: string;
  status?: string;
  priority?: string;
  case_type_id?: string;
  case_issue_id?: string;
  court?: string;
  next_hearing_date?: string;
  assigned_to?: string;
  custom_fields?: Record<string, unknown>;
}

export interface UpdateCaseData extends Partial<CreateCaseData> {
  id: string;
}

export interface CasesResult {
  cases: Case[];
  count: number;
}

/**
 * Paginated cases hook with filtering support
 */
export function useCases(
  initialPage = 1,
  pageSize = 10,
  statusFilter?: string,
  priorityFilter?: string
) {
  const [page, setPage] = useState(initialPage);
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  const query = useQuery<CasesResult, Error>({
    queryKey: ['cases', organizationId, page, pageSize, statusFilter, priorityFilter],
    queryFn: async () => {
      if (!organizationId) {
        return { cases: [], count: 0 };
      }

      return invokeNodeApi<CasesResult>('/api/v1/cases', {
        query: {
          page,
          pageSize,
          status: statusFilter,
          priority: priorityFilter,
        },
      });
    },
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  return {
    ...query,
    page,
    pageSize,
    setPage,
  };
}

/**
 * Fetch a single case by ID
 */
export function useCase(id: string) {
  const { user } = useAuth();
  const { data: organizationId } = useUserOrganization();

  return useQuery<Case, Error>({
    queryKey: ['case', id],
    queryFn: async () => {
      if (!user?.id || !organizationId) {
        throw new Error('User not authenticated or organization not found');
      }

      return invokeNodeApi<Case>(`/api/v1/cases/${id}`);
    },
    enabled: !!id && !!user?.id && !!organizationId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Create a new case
 */
export function useCreateCase() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async (caseData: CreateCaseData) => {
      if (!user?.id || !organizationId) {
        throw new Error('User not authenticated or organization not found');
      }

      return invokeNodeApi<Case>('/api/v1/cases', {
        method: 'POST',
        body: caseData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success('Success', { description: 'Matter created successfully.' });
    },
    onError: (error: Error) => {
      toast.error('Error', { description: error.message || 'Failed to create matter.' });
    },
  });
}

/**
 * Update an existing case
 */
export function useUpdateCase() {
  const queryClient = useQueryClient();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async ({ id, ...updateData }: UpdateCaseData) => {
      if (!organizationId) throw new Error('Organization not found');

      return invokeNodeApi<Case>(`/api/v1/cases/${id}`, {
        method: 'PATCH',
        body: updateData,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['case', data.id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success('Success', { description: 'Matter updated successfully.' });
    },
    onError: (error: Error) => {
      toast.error('Error', { description: error.message || 'Failed to update matter.' });
    },
  });
}

/**
 * Delete a case
 */
export function useDeleteCase() {
  const queryClient = useQueryClient();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!organizationId) throw new Error('Organization not found');

      await invokeNodeApi<void>(`/api/v1/cases/${id}`, {
        method: 'DELETE',
      });
      return;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success('Success', { description: 'Matter deleted successfully.' });
    },
    onError: (error: Error) => {
      toast.error('Error', { description: error.message || 'Failed to delete matter.' });
    },
  });
}

/**
 * Fetch all cases (for analytics, without pagination)
 */
export function useAllCases() {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  return useQuery<Case[], Error>({
    queryKey: ['all-cases', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      const result = await invokeNodeApi<CasesResult>('/api/v1/cases', {
        query: {
          page: 1,
          pageSize: 1000,
        },
      });
      return result.cases;
    },
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Fetch cases by client ID
 */
export function useCasesByClient(clientId: string) {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  return useQuery<CasesResult, Error>({
    queryKey: ['cases-by-client', clientId, organizationId],
    queryFn: async () => {
      if (!organizationId || !clientId) {
        return { cases: [], count: 0 };
      }

      return invokeNodeApi<CasesResult>('/api/v1/cases', {
        query: {
          page: 1,
          pageSize: 1000,
          clientId,
        },
      });
    },
    enabled: !!organizationId && !!clientId && !orgLoading && !orgError,
    staleTime: 2 * 60 * 1000,
  });
}
