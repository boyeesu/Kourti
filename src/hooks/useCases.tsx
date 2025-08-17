
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { Case } from '@/types';

export interface CreateCaseData {
  title: string;
  description?: string;
  case_number?: string;
  status?: string;
  priority?: string;
  assigned_to?: string;
  court?: string;
  next_hearing_date?: string;
  client_id?: string;
  case_type_id?: string;
  case_issue_id?: string;
  custom_fields?: Record<string, any>;
}

export interface UpdateCaseData extends Partial<CreateCaseData> {
  id: string;
}

export function useCases(page = 1, pageSize = 20) {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();
  const [currentPage, setCurrentPage] = useState(page);

  const query = useQuery({
    queryKey: ['cases', organizationId, currentPage, pageSize],
    queryFn: async () => {
      if (!organizationId) {
        console.log('⚠️ No organization ID for cases query');
        return { cases: [], count: 0 };
      }

      console.log('🔍 Fetching cases for org:', organizationId, 'page:', currentPage);

      const from = (currentPage - 1) * pageSize;
      const to = currentPage * pageSize - 1;

      const { data, error, count } = await supabase
        .from('cases')
        .select(`
          *, 
          client:client_id(id, name), 
          assigned_user:assigned_to(id, first_name, last_name),
          case_type:case_types(*)!case_type_id,
          case_issue:case_issues(*)!case_issue_id
        `, { count: 'exact' })
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error('❌ Error fetching cases:', error);
        throw error;
      }
      
      console.log('✅ Cases found:', data?.length || 0, 'of total', count || 0);
      return { cases: data as Case[], count: count || 0 };
    },
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return {
    ...query,
    page: currentPage,
    pageSize,
    setPage: setCurrentPage,
  };
}

export function useCase(id: string) {
  return useQuery({
    queryKey: ['case', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cases')
        .select(`
          *, 
          client:client_id(id, name), 
          assigned_user:assigned_to(id, first_name, last_name),
          case_type:case_types(*)!case_type_id,
          case_issue:case_issues(*)!case_issue_id
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Case;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCasesByClient(clientId: string) {
  return useQuery({
    queryKey: ['cases', 'client', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cases')
        .select('*')
        .eq('client_id', clientId)
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
      
      if (!userId) {
        throw new Error("User is not authenticated. Please sign in to create a case.");
      }
      
      // Get organization ID from user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', userId)
        .single();
        
      if (profileError) {
        console.error("Error fetching profile:", profileError);
        throw new Error("Could not retrieve user profile information.");
      }
      
      if (!profile?.organization_id) {
        throw new Error("No organization associated with your account. Please contact your administrator.");
      }

      const { data, error } = await supabase
        .from('cases')
        .insert({
          ...caseData,
          organization_id: profile.organization_id,
          created_by: userId,
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating case:", error);
        throw error;
      }
      
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
