import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { Client } from '@/types';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

// Type definitions using database types
type ClientInsert = TablesInsert<'clients'>;
type ClientUpdate = TablesUpdate<'clients'>;

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

// Request deduplication helper
const pendingClientMutations = new Map<string, Promise<unknown>>();

function deduplicateClientMutation<T>(key: string, mutationFn: () => Promise<T>): Promise<T> {
  const existing = pendingClientMutations.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = mutationFn().finally(() => {
    pendingClientMutations.delete(key);
  });

  pendingClientMutations.set(key, promise);
  return promise;
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

      const from = (page - 1) * pageSize;
      const to = page * pageSize - 1;

      const { data, error, count } = await supabase
        .from('clients')
        .select(
          `*, cases!cases_client_id_fkey(count), contracts!fk_contracts_client_id(count)`,
          { count: 'exact' }
        )
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        throw error;
      }

      const items = (data ?? []).map((client) => {
        const typed = client as unknown as { cases: unknown[]; contracts: unknown[]; };
        return {
          ...client,
          cases: typed.cases ?? [],
          contracts: typed.contracts ?? [],
        };
      }) as Client[];

      return { items, total: count ?? 0 };
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

      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .eq('organization_id', organizationId)
        .single();

      if (error) throw error;
      return data as Client;
    },
    enabled: !!id && !!user?.id && !!organizationId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async (clientData: CreateClientData) => {
      if (!user?.id || !organizationId) {
        throw new Error('User not authenticated or organization not found');
      }

      // Deduplication to prevent double submissions
      const dedupeKey = `create-client-${clientData.name}-${Date.now()}`;

      return deduplicateClientMutation(dedupeKey, async () => {
        const insertData: ClientInsert = {
          ...clientData,
          organization_id: organizationId,
          created_by: user.id,
          user_id: user.id,
        };

        const { data, error } = await supabase
          .from('clients')
          .insert(insertData)
          .select()
          .single();

        if (error) throw error;
        return data;
      });
    },
    onSuccess: () => {
      // Granular invalidation
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: ['clients', organizationId],
          exact: false,
        });
      }
      toast({
        title: "Success",
        description: "Client created successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create client.",
      });
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async ({ id, ...updateData }: UpdateClientData) => {
      // Deduplication
      const dedupeKey = `update-client-${id}`;

      return deduplicateClientMutation(dedupeKey, async () => {
        const clientUpdate: ClientUpdate = updateData;

        const { data, error } = await supabase
          .from('clients')
          .update(clientUpdate)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return data;
      });
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
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update client.",
      });
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
      toast({
        title: "Success",
        description: "Client updated successfully.",
      });
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async (id: string) => {
      // Deduplication
      const dedupeKey = `delete-client-${id}`;

      return deduplicateClientMutation(dedupeKey, async () => {
        const { error } = await supabase
          .from('clients')
          .delete()
          .eq('id', id);

        if (error) throw error;
        return id;
      });
    },
    // Optimistic delete
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['clients'] });

      // Snapshot current clients for rollback
      const previousClientsQueries = queryClient.getQueriesData<ClientsQueryResult>({
        queryKey: ['clients'],
      });

      // Optimistically remove client from lists
      queryClient.setQueriesData<ClientsQueryResult>(
        { queryKey: ['clients'] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.filter((c) => c.id !== id),
            total: Math.max(0, old.total - 1),
          };
        }
      );

      return { previousClientsQueries };
    },
    onError: (error: Error, _id, context) => {
      // Rollback on error
      if (context?.previousClientsQueries) {
        context.previousClientsQueries.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete client.",
      });
    },
    onSuccess: () => {
      // Granular invalidation
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: ['clients', organizationId],
          exact: false,
        });
      }
      toast({
        title: "Success",
        description: "Client deleted successfully.",
      });
    },
  });
}
