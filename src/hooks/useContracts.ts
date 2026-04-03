import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { Contract } from '@/types';
import { invokeNodeApi } from '@/lib/backendApi';

export interface CreateContractData {
  title: string;
  description?: string;
  content?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  value?: number;
  currency?: string;
  client_id?: string;
  contract_type?: string;
  terms?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateContractData extends Partial<CreateContractData> {
  id: string;
}

export interface ContractsResult {
  contracts: Contract[];
  count: number;
}

/**
 * Paginated contracts hook with filtering support
 */
export function useContracts(page = 1, pageSize = 10, statusFilter?: string) {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  const query = useQuery<ContractsResult, Error>({
    queryKey: ['contracts', organizationId, page, pageSize, statusFilter],
    queryFn: async () => {
      if (!organizationId) {
        return { contracts: [], count: 0 };
      }

      return invokeNodeApi<ContractsResult>('/api/v1/contracts', {
        query: {
          page,
          pageSize,
          status: statusFilter,
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
  };
}

/**
 * Fetch a single contract by ID
 */
export function useContract(id: string) {
  const { user } = useAuth();
  const { data: organizationId } = useUserOrganization();

  return useQuery<Contract, Error>({
    queryKey: ['contract', id],
    queryFn: async () => {
      if (!user?.id || !organizationId) {
        throw new Error('User not authenticated or organization not found');
      }

      return invokeNodeApi<Contract>(`/api/v1/contracts/${id}`);
    },
    enabled: !!id && !!user?.id && !!organizationId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Create a new contract
 */
export function useCreateContract() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async (contractData: CreateContractData) => {
      if (!user?.id || !organizationId) {
        throw new Error('User not authenticated or organization not found');
      }

      return invokeNodeApi<Contract>('/api/v1/contracts', {
        method: 'POST',
        body: contractData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success('Success', { description: 'Contract created successfully.' });
    },
    onError: (error: Error) => {
      toast.error('Error', { description: error.message || 'Failed to create contract.' });
    },
  });
}

/**
 * Update an existing contract
 */
export function useUpdateContract() {
  const queryClient = useQueryClient();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async ({ id, ...updateData }: UpdateContractData) => {
      if (!organizationId) throw new Error('Organization not found');

      return invokeNodeApi<Contract>(`/api/v1/contracts/${id}`, {
        method: 'PATCH',
        body: updateData,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract', data.id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success('Success', { description: 'Contract updated successfully.' });
    },
    onError: (error: Error) => {
      toast.error('Error', { description: error.message || 'Failed to update contract.' });
    },
  });
}

/**
 * Delete a contract
 */
export function useDeleteContract() {
  const queryClient = useQueryClient();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!organizationId) throw new Error('Organization not found');

      await invokeNodeApi<void>(`/api/v1/contracts/${id}`, {
        method: 'DELETE',
      });
      return;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success('Success', { description: 'Contract deleted successfully.' });
    },
    onError: (error: Error) => {
      toast.error('Error', { description: error.message || 'Failed to delete contract.' });
    },
  });
}

/**
 * Fetch all contracts (for analytics, without pagination)
 */
export function useAllContracts() {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  return useQuery<Contract[], Error>({
    queryKey: ['all-contracts', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      const result = await invokeNodeApi<ContractsResult>('/api/v1/contracts', {
        query: { page: 1, pageSize: 1000 },
      });
      return result.contracts;
    },
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Fetch expiring contracts (within N days)
 */
export function useExpiringContracts(daysAhead: number = 30) {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  return useQuery<Contract[], Error>({
    queryKey: ['expiring-contracts', organizationId, daysAhead],
    queryFn: async () => {
      if (!organizationId) return [];

      const result = await invokeNodeApi<ContractsResult>('/api/v1/contracts', {
        query: { page: 1, pageSize: 1000, expiringDays: daysAhead },
      });
      return result.contracts;
    },
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch contracts by client ID
 */
export function useContractsByClient(clientId: string) {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  return useQuery<Contract[], Error>({
    queryKey: ['contracts-by-client', clientId, organizationId],
    queryFn: async () => {
      if (!organizationId || !clientId) return [];

      const result = await invokeNodeApi<ContractsResult>('/api/v1/contracts', {
        query: { page: 1, pageSize: 1000, clientId },
      });
      return result.contracts;
    },
    enabled: !!organizationId && !!clientId && !orgLoading && !orgError,
    staleTime: 2 * 60 * 1000,
  });
}
