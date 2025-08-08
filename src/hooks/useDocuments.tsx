import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUserOrganization } from './useUserOrganization';

export interface Document {
  id: string;
  organization_id: string;
  case_id?: string;
  client_id?: string;
  title: string;
  description?: string;
  file_path?: string;
  file_type?: string;
  file_size?: number;
  category?: string;
  tags?: string[];
  uploaded_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateDocumentData {
  title: string;
  description?: string;
  file_path?: string;
  file_type?: string;
  file_size?: number;
  category?: string;
  tags?: string[];
  case_id?: string;
  client_id?: string;
}

export function useDocuments() {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  return useQuery({
    queryKey: ['documents', organizationId],
    queryFn: async () => {
      if (!organizationId) {
        if (import.meta.env.DEV) {
          console.log('⚠️ No organization ID for documents query');
        }
        return [];
      }

      if (import.meta.env.DEV) {
        console.log('🔍 Fetching documents for org:', organizationId);
      }

      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error fetching documents:', error);
        throw error;
      }
      
      if (import.meta.env.DEV) {
        console.log('✅ Documents found:', data?.length || 0);
      }
      return data as Document[];
    },
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: ['document', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Document;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDocumentsByCase(caseId: string) {
  return useQuery({
    queryKey: ['documents', 'case', caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Document[];
    },
    enabled: !!caseId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (documentData: CreateDocumentData) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      const { data, error } = await supabase
        .from('documents')
        .insert({
          ...documentData,
          organization_id: profile?.organization_id,
          uploaded_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast({
        title: "Success",
        description: "Document uploaded successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to upload document.",
      });
    },
  });
}

export function useUpdateDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updateData }: { id: string } & Partial<CreateDocumentData>) => {
      const { data, error } = await supabase
        .from('documents')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['document', data.id] });
      toast({
        title: "Success",
        description: "Document updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update document.",
      });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast({
        title: "Success",
        description: "Document deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete document.",
      });
    },
  });
}
