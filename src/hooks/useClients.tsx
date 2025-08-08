import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useOrganizationContext } from '@/context/OrganizationContext';

export interface Client {
  id: string;
  organization_id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  company?: string;
  notes?: string;
  status: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  cases?: { count: number }[];
  contracts?: { count: number }[];
}

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

export function useClients() {
  const { organizationId, isLoading: orgLoading, error: orgError } = useOrganizationContext();

  return useQuery({
    queryKey: ['clients', organizationId],
    queryFn: async () => {
      if (!organizationId) {
        console.log('⚠️ No organization ID for clients query');
        return [];
      }

      console.log('🔍 Fetching clients for org:', organizationId);

      const { data, error } = await supabase
        .from('clients')
        .select(`
          *,
          cases!cases_client_id_fkey(count),
          contracts!fk_contracts_client_id(count)
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error fetching clients:', error);
        throw error;
      }
      
      console.log('✅ Clients found:', data?.length || 0);
      return (data ?? []).map(client => ({
        ...client,
        cases: client.cases ?? [],
        contracts: client.contracts ?? [],
      })) as Client[];
    },
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 2 * 60 * 1000, // 2 minutes for faster updates
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useClient(id: string) {
  const { organizationId } = useOrganizationContext();

  return useQuery({
    queryKey: ['client', id, organizationId],
    queryFn: async () => {
      if (!organizationId) {
        throw new Error('User organization not found');
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
    enabled: !!id && !!organizationId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { organizationId } = useOrganizationContext();

  return useMutation({
    mutationFn: async (clientData: CreateClientData) => {
      if (!organizationId) {
        throw new Error('Organization not found');
      }

      const { data, error } = await supabase
        .from('clients')
        .insert({
          ...clientData,
          organization_id: organizationId,
          created_by: (await supabase.auth.getUser()).data.user?.id,
        })
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
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client', data.id] });
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
        .eq('id', id);

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