import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { Client } from '@/types';

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

/**
 * Paginated clients hook: fetches clients page-by-page to improve performance.
 * Returns an object with `items` and `total` count.
 */
import type { UseQueryResult } from '@tanstack/react-query';

export function useClients(page = 1, pageSize = 10): UseQueryResult<{ items: Client[]; total: number }, Error> {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  return useQuery<{ items: Client[]; total: number }, Error, { items: Client[]; total: number }>({
    queryKey: ['clients', organizationId, page, pageSize],
    queryFn: async () => {
      if (!organizationId) throw new Error('Organization ID missing');

      const from = (page - 1) * pageSize;
      const to = page * pageSize - 1;
      console.log(`🔍 Fetching clients page ${page} size ${pageSize} for org:`, organizationId);

      const { data, error, count } = await supabase
        .from('clients')
        .select(
          `*, cases!cases_client_id_fkey(count), contracts!fk_contracts_client_id(count)`
        , { count: 'exact' })
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error('❌ Error fetching clients:', error);
        throw error;
      }

      const items = (data ?? []).map((client: any) => ({
        ...client,
        cases: client.cases ?? [],
        contracts: client.contracts ?? [],
      })) as Client[];

      console.log('✅ Clients page loaded:', items.length, 'of total', count ?? 0);
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

  return useQuery({
    queryKey: ['client', id],
    queryFn: async () => {
      if (!user?.id || !organizationId) {
        throw new Error('User not authenticated or organization not found');
      }

      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id as any)
        .eq('organization_id', organizationId)
        .single();

      if (error) throw error;
      return data as any as Client;
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

      const { data, error } = await supabase
        .from('clients')
        .insert({
          ...clientData,
          organization_id: organizationId,
          created_by: user.id,
          user_id: user.id,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast({
        title: "Success",
        description: "Client created successfully.",
      });
    },
    onError: (error: any) => {
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

  return useMutation({
    mutationFn: async ({ id, ...updateData }: UpdateClientData) => {
      const { data, error } = await supabase
        .from('clients')
        .update(updateData as any)
        .eq('id', id as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client', (data as any).id] });
      toast({
        title: "Success",
        description: "Client updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update client.",
      });
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', id as any);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast({
        title: "Success",
        description: "Client deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete client.",
      });
    },
  });
}
