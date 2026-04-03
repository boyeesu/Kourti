import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { Client } from '@/types';
import { invokeNodeApi } from '@/lib/backendApi';

export interface CreateClientData {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  company?: string;
  notes?: string;
  status?: string;
}

export interface UpdateClientData extends Partial<CreateClientData> {
  id: string;
}

interface ClientsQueryResult {
  items: Client[];
  total: number;
}

/**
 * Paginated clients hook: fetches clients page-by-page to improve performance.
 * Returns an object with `items` and `total` count.
 */
export function useClients(page = 1, pageSize = 10): UseQueryResult<ClientsQueryResult, Error> {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  return useQuery<ClientsQueryResult, Error>({
    queryKey: ['clients', organizationId, page, pageSize],
    queryFn: async (): Promise<ClientsQueryResult> => {
      if (!organizationId) throw new Error('Organization ID missing');

      return invokeNodeApi<ClientsQueryResult>('/api/v1/clients', {
        query: { page: String(page), pageSize: String(pageSize) },
      });
    },
    enabled: Boolean(organizationId) && !orgLoading && !orgError,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

export function useClient(id: string) {
  const { user } = useAuth();
  const { data: organizationId } = useUserOrganization();

  return useQuery<Client, Error>({
    queryKey: ['client', id],
    queryFn: async (): Promise<Client> => {
      if (!user?.id || !organizationId) {
        throw new Error('User not authenticated or organization not found');
      }

      return invokeNodeApi<Client>(`/api/v1/clients/${id}`);
    },
    enabled: !!id && !!user?.id && !!organizationId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();

  const { user } = useAuth();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async (clientData: CreateClientData) => {
      if (!user?.id || !organizationId) {
        throw new Error('User not authenticated or organization not found');
      }

      return invokeNodeApi<Client>('/api/v1/clients', { method: 'POST', body: clientData });
    },
    onSuccess: () => {
      // Granular invalidation
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: ['clients', organizationId],
          exact: false,
        });
      }
      toast.success('Success', { description: 'Client created successfully.' });
    },
    onError: (error: Error) => {
      toast.error('Error', { description: error.message || 'Failed to create client.' });
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();

  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async ({ id, ...updateData }: UpdateClientData) => {
      return invokeNodeApi<Client>(`/api/v1/clients/${id}`, { method: 'PATCH', body: updateData });
    },
    // Optimistic update
    onMutate: async ({ id, ...updateData }) => {
      await queryClient.cancelQueries({ queryKey: ['client', id] });

      const previousClient = queryClient.getQueryData<Client>(['client', id]);

      if (previousClient) {
        queryClient.setQueryData<Client>(['client', id], {
          ...previousClient,
          ...updateData,
          updated_at: new Date().toISOString(),
        } as Client);
      }

      return { previousClient };
    },
    onError: (error: Error, { id }, context) => {
      // Rollback on error
      if (context?.previousClient) {
        queryClient.setQueryData(['client', id], context.previousClient);
      }
      toast.error('Error', { description: error.message || 'Failed to update client.' });
    },
    onSuccess: (data) => {
      // Granular invalidation
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: ['clients', organizationId],
          exact: false,
        });
      }
      // Update specific client cache with server data
      if (data) {
        queryClient.setQueryData(['client', data.id], data);
      }
      toast.success('Success', { description: 'Client updated successfully.' });
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();

  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async (id: string) => {
      await invokeNodeApi(`/api/v1/clients/${id}`, { method: 'DELETE' });
      return id;
    },
    // Optimistic delete
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['clients'] });

      // Snapshot current clients for rollback
      const previousClientsQueries = queryClient.getQueriesData<ClientsQueryResult>({
        queryKey: ['clients'],
      });

      // Optimistically remove client from lists
      queryClient.setQueriesData<ClientsQueryResult>({ queryKey: ['clients'] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.filter((c) => c.id !== id),
          total: Math.max(0, old.total - 1),
        };
      });

      return { previousClientsQueries };
    },
    onError: (error: Error, _id, context) => {
      // Rollback on error
      if (context?.previousClientsQueries) {
        context.previousClientsQueries.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error('Error', { description: error.message || 'Failed to delete client.' });
    },
    onSuccess: () => {
      // Granular invalidation
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: ['clients', organizationId],
          exact: false,
        });
      }
      toast.success('Success', { description: 'Client deleted successfully.' });
    },
  });
}
