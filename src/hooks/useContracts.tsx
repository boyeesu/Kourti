import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUserOrganization } from './useUserOrganization';

export interface Contract {
  id: string;
  organization_id: string;
  client_id?: string;
  title: string;
  description?: string;
  contract_type?: string;
  status: string;
  value?: number;
  currency: string;
  start_date?: string;
  end_date?: string;
  terms?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateContractData {
  title: string;
  description?: string;
  contract_type?: string;
  status?: string;
  value?: number;
  currency?: string;
  start_date?: string;
  end_date?: string;
  terms?: string;
  client_id?: string;
}

export function useContracts() {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  return useQuery({
    queryKey: ['contracts', organizationId],
    queryFn: async () => {
      if (!organizationId) {
        if (import.meta.env.DEV) {
          console.log('⚠️ No organization ID for contracts query');
        }
        return [];
      }

      if (import.meta.env.DEV) {
        console.log('🔍 Fetching contracts for org:', organizationId);
      }

      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error fetching contracts:', error);
        throw error;
      }
      
      if (import.meta.env.DEV) {
        console.log('✅ Contracts found:', data?.length || 0);
      }
      return data as Contract[];
    },
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useContract(id: string) {
  return useQuery({
    queryKey: ['contract', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Contract;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useContractsByClient(clientId: string) {
  return useQuery({
    queryKey: ['contracts', 'client', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Contract[];
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateContract() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (contractData: CreateContractData) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      const { data, error } = await supabase
        .from('contracts')
        .insert({
          ...contractData,
          organization_id: profile?.organization_id,
          created_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      toast({
        title: "Success",
        description: "Contract created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create contract.",
      });
    },
  });
}

export function useUpdateContract() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updateData }: { id: string } & Partial<CreateContractData>) => {
      const { data, error } = await supabase
        .from('contracts')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract', data.id] });
      toast({
        title: "Success",
        description: "Contract updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update contract.",
      });
    },
  });
}

export function useDeleteContract() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('contracts')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      toast({
        title: "Success",
        description: "Contract deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete contract.",
      });
    },
  });
}
