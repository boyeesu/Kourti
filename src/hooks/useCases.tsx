
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { useUserOrganization } from '@/hooks/useUserOrganization';


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
  custom_fields?: any;
}

export interface UpdateCaseData extends Partial<CreateCaseData> {
  id: string;
}

/**
 * Hook for fetching paginated cases with optimized query
 */
export function useCases(page = 1, pageSize = 20) {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();
  const [currentPage, setCurrentPage] = useState(page);

  const query = useQuery({
    queryKey: ['cases', organizationId, currentPage, pageSize],
    queryFn: async () => {
      if (!organizationId) {
        return { cases: [], count: 0 };
      }

      const from = (currentPage - 1) * pageSize;
      const to = currentPage * pageSize - 1;

      // Optimize query to only select the fields we actually need
      const { data, error, count } = await supabase
        .from('cases')
        .select(`
          id, 
          title, 
          description, 
          case_number, 
          status, 
          priority, 
          assigned_to, 
          court, 
          next_hearing_date,
          client_id,
          case_type_id,
          created_at,
          updated_at,
          created_by,
          organization_id,
          custom_fields,
          client:client_id(id, name), 
          assigned_user:assigned_to(id, first_name, last_name),
          case_type:case_types(id, name, description)
        `, { count: 'exact' })
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        throw error;
      }
      
      return { cases: data as any[], count: count || 0 };
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

/**
 * Hook for fetching a single case by ID
 */
export function useCase(id: string) {
  return useQuery({
    queryKey: ['case', id],
    queryFn: async () => {
      // Optimize query to only select the fields we need
      const { data, error } = await supabase
        .from('cases')
        .select(`
          id, 
          title, 
          description, 
          case_number, 
          status, 
          priority, 
          assigned_to, 
          court, 
          next_hearing_date,
          client_id,
          case_type_id,
          created_at,
          updated_at,
          created_by,
          organization_id,
          custom_fields,
          client:client_id(id, name), 
          assigned_user:assigned_to(id, first_name, last_name),
          case_type:case_types(id, name, description)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook for fetching cases by client ID
 */
export function useCasesByClient(clientId: string, page = 1, pageSize = 10) {
  const [currentPage, setCurrentPage] = useState(page);
  
  const query = useQuery({
    queryKey: ['cases', 'client', clientId, currentPage, pageSize],
    queryFn: async () => {
      const from = (currentPage - 1) * pageSize;
      const to = currentPage * pageSize - 1;
      
      // Add pagination and select only needed fields
      const { data, error, count } = await supabase
        .from('cases')
        .select(`
          id, 
          title, 
          description, 
          case_number, 
          status, 
          priority, 
          assigned_to, 
          next_hearing_date,
          created_at,
          updated_at,
          created_by,
          organization_id
        `, { count: 'exact' })
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      return { 
        cases: data as any[], 
        count: count || 0 
      };
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    ...query,
    page: currentPage,
    pageSize,
    setPage: setCurrentPage,
  };
}

/**
 * Hook for creating a new case
 */
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
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : "Failed to create case.";
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
    },
  });
}

/**
 * Hook for updating an existing case
 */
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
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : "Failed to update case.";
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
    },
  });
}

/**
 * Hook for deleting a case
 */
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
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : "Failed to delete case.";
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
    },
  });
}
