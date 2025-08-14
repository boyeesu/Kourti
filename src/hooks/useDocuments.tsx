
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { Document } from '@/types';

export interface CreateDocumentData {
  name: string;
  content: string;
  summary?: string;
  metadata?: any;
  effective_date?: string;
  renewal_date?: string;
  termination_date?: string;
  value?: number;
  contract_type?: string;
  currency?: string;
  terms?: string;
}

export function useDocuments() {
  return useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', userId)
        .single();

      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('organization_id', profile?.organization_id);

      if (error) throw error;
      return data as Document[];
    },
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
  });
}

export function useDocumentsByClient(clientId: string) {
  return useQuery({
    queryKey: ['documents', 'client', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('client_id', clientId);

      if (error) throw error;
      return data as Document[];
    },
  });
}

export function useCreateDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (documentData: CreateDocumentData) => {
      const userId = await getCurrentUserId();
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', userId)
        .single();

      const { data, error } = await supabase
        .from('documents')
        .insert({
          ...documentData,
          organization_id: profile?.organization_id,
          created_by: userId,
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
        description: "Document created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create document.",
      });
    },
  });
}
