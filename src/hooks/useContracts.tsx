/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { Contract } from '@/types';
import { logError } from '@/lib/logger';

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

/**
 * Hook for fetching contracts with pagination and filtering
 * @param page Current page number (default: 1)
 * @param pageSize Number of records per page (default: 10)
 * @param status Optional filter by status
 * @param clientId Optional filter by client ID
 */
export function useContracts(page = 1, pageSize = 10, status?: string, clientId?: string) {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  return useQuery({
    queryKey: ['contracts', organizationId, page, pageSize, status, clientId],
    queryFn: async () => {
      if (!organizationId) {
        return { contracts: [], count: 0 };
      }

      // No mock data - always fetch from database

      try {
        // Calculate pagination range
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        // Start building the query
        let query = supabase
          .from('contracts')
          .select(
            `
            id,
            title,
            description,
            contract_type,
            status,
            value,
            currency,
            start_date,
            end_date,
            terms,
            client_id,
            organization_id,
            created_at,
            updated_at,
            created_by,
            client:client_id(id, name)
          `,
            { count: 'exact' }
          )
          .eq('organization_id', organizationId);

        // Apply filters if provided
        if (status) {
          query = query.eq('status', status as any);
        }

        if (clientId) {
          query = query.eq('client_id', clientId as any);
        }

        // Apply sorting and pagination
        const { data, error, count } = await query
          .order('created_at', { ascending: false })
          .range(from, to);

        if (error) {
          throw error;
        }

        return {
          contracts: data as Contract[],
          count: count || 0,
        };
      } catch (error) {
        logError('Error fetching contracts', error);
        throw error;
      }
    },
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Hook for fetching a single contract by ID
 */
export function useContract(id: string) {
  return useQuery({
    queryKey: ['contract', id],
    queryFn: async () => {
      // Optimize query to only select needed fields and include related data
      const { data, error } = await supabase
        .from('contracts')
        .select(
          `
          id,
          title,
          description,
          contract_type,
          status,
          value,
          currency,
          start_date,
          end_date,
          terms,
          client_id,
          organization_id,
          created_at,
          updated_at,
          created_by,
          client:client_id(id, name)
        `
        )
        .eq('id', id as any)
        .single();

      if (error) throw error;
      return data as Contract;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook for fetching contracts by client ID with pagination
 */
export function useContractsByClient(clientId: string, page = 1, pageSize = 5) {
  return useQuery({
    queryKey: ['contracts', 'client', clientId, page, pageSize],
    queryFn: async () => {
      if (!clientId) {
        return { contracts: [], count: 0 };
      }

      // Calculate pagination range
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await supabase
        .from('contracts')
        .select(
          `
          id,
          title,
          status,
          value,
          currency,
          start_date,
          end_date,
          terms,
          created_at
        `,
          { count: 'exact' }
        )
        .eq('client_id', clientId as any)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      return {
        contracts: data as any as Contract[],
        count: count || 0,
      };
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook for creating a new contract
 */
export function useCreateContract() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (contractData: CreateContractData) => {
      const userId = await getCurrentUserId();

      if (!userId) {
        throw new Error('User is not authenticated. Please sign in to create a contract.');
      }

      // Get organization ID from user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', userId as any)
        .single();

      if (profileError) {
        throw new Error('Could not retrieve user profile information.');
      }

      if (!(profile as any)?.organization_id) {
        throw new Error(
          'No organization associated with your account. Please contact your administrator.'
        );
      }

      const { data, error } = await supabase
        .from('contracts')
        .insert({
          ...contractData,
          organization_id: (profile as any).organization_id,
          created_by: userId,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      toast({
        title: 'Success',
        description: 'Contract created successfully.',
      });
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create contract.';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage,
      });
    },
  });
}

/**
 * Hook for updating a contract
 */
export function useUpdateContract() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updateData }: { id: string } & Partial<CreateContractData>) => {
      const { data, error } = await supabase
        .from('contracts')
        .update({
          ...updateData,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', id as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract', (data as any).id] });
      toast({
        title: 'Success',
        description: 'Contract updated successfully.',
      });
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update contract.';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage,
      });
    },
  });
}

/**
 * Hook for deleting a contract
 */
export function useDeleteContract() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('contracts')
        .delete()
        .eq('id', id as any);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      toast({
        title: 'Success',
        description: 'Contract deleted successfully.',
      });
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete contract.';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage,
      });
    },
  });
}
