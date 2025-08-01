import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Case {
  id: string;
  organization_id: string;
  client_id?: string;
  title: string;
  description?: string;
  case_number?: string;
  status: string;
  priority: string;
  assigned_to?: string;
  court?: string;
  next_hearing_date?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // Joined data
  client?: {
    id: string;
    name: string;
  };
  assigned_user?: {
    id: string;
    first_name?: string;
    last_name?: string;
  } | null;
}

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

export function useCases() {
  return useQuery({
    queryKey: ['cases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cases')
        .select(`
          *,
          client:clients(id, name),
          assigned_user:profiles(id, first_name, last_name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as any[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useCase(id: string) {
  return useQuery({
    queryKey: ['case', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cases')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as any;
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
      return data as any[];
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
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
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
          created_by: (await supabase.auth.getUser()).data.user?.id,
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