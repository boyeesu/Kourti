import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { Case } from '@/types';

export interface CreateCaseData {
  title: string;
  description?: string;
  case_number?: string;
  status?: string;
  priority?: string;
  client_id?: string;
  assigned_to?: string;
  court?: string;
  next_hearing_date?: string;
}

export interface UpdateCaseData extends Partial<CreateCaseData> {
  id: string;
}

export function useCases(initialPageSize = 10) {
  const [page, setPage] = useState(1);
  const pageSize = initialPageSize;
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  const query = useQuery({
    queryKey: ['cases', page, pageSize, organizationId],
    queryFn: async () => {
      if (!organizationId) {
        console.log('⚠️ No organization ID for cases query');
        return { cases: [], count: 0 };
      }

      console.log('🔍 Fetching cases for org:', organizationId);

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await supabase
        .from('cases')
        .select(
          `
          *,
          client:clients!cases_client_id_fkey(id, name),
          assigned_user:profiles(id, first_name, last_name)
          `,
          { count: 'exact' }
        )
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error('❌ Error fetching cases:', error);
        throw error;
      }
      
      console.log('✅ Cases found:', data?.length || 0, 'Total count:', count);
      return { cases: data as Case[], count: count || 0 };
    },
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 30 * 1000, // 30 seconds for faster updates
    gcTime: 2 * 60 * 1000, // 2 minutes
    placeholderData: (previousData) => previousData,
  });

  return {
    ...query,
    page,
    pageSize,
    setPage,
  };
}

export function useCase(id: string) {
  return useQuery({
    queryKey: ['case', id],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', userId)
        .single();

      if (!profile?.organization_id) {
        throw new Error('User organization not found');
      }

      const { data, error } = await supabase
        .from('cases')
        .select(`
          *,
          client:clients!cases_client_id_fkey(id, name),
          assigned_user:profiles(id, first_name, last_name)
        `)
        .eq('id', id)
        .eq('organization_id', profile.organization_id)
        .single();

      if (error) throw error;
      return data as Case;
    },
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

export function useCasesByClient(clientId: string) {
  return useQuery({
    queryKey: ['cases', 'client', clientId],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', userId)
        .single();

      const organizationId = profile?.organization_id;
      if (!organizationId) {
        throw new Error('User organization not found');
      }

      const { data, error } = await supabase
        .from('cases')
        .select(`
          *,
          client:clients!cases_client_id_fkey(id, name),
          assigned_user:profiles(id, first_name, last_name)
        `)
        .eq('client_id', clientId)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Case[];
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateCase() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (caseData: CreateCaseData) => {
      const userId = await getCurrentUserId();
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', userId)
        .single();

      // Generate case number if not provided
      let caseNumber = caseData.case_number;
      if (!caseNumber) {
        const year = new Date().getFullYear();
        const { count } = await supabase
          .from('cases')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', profile?.organization_id);
        
        caseNumber = `${year}-${String((count || 0) + 1).padStart(4, '0')}`;
      }

      const { data, error } = await supabase
        .from('cases')
        .insert({
          ...caseData,
          case_number: caseNumber,
          organization_id: profile?.organization_id,
          created_by: userId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      toast({
        title: "Success",
        description: "Case created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create case.",
      });
    },
  });
}

export function useUpdateCase() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updateData }: UpdateCaseData) => {
      const { data, error } = await supabase
        .from('cases')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['case', data.id] });
      toast({
        title: "Success",
        description: "Case updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update case.",
      });
    },
  });
}

export function useDeleteCase() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('cases')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      toast({
        title: "Success",
        description: "Case deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete case.",
      });
    },
  });
}
