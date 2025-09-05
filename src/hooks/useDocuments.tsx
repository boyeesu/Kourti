
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
  file_path?: string;
  file_size?: number;
  mime_type?: string;
}

export interface UploadDocumentData {
  name: string;
  file: File;
  case_id?: string;
  metadata?: any;
}

export function useDocuments() {
  return useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', userId as any)
        .single();

      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('organization_id', (profile as any)?.organization_id || '');

      if (error) throw error;
      return data as any as Document[];
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
        .eq('id', id as any)
        .single();

      if (error) throw error;
      return data as any as Document;
    },
  });
}

export function useDocumentsByClient(clientId: string) {
  return useQuery({
    queryKey: ['documents', 'client', clientId],
    queryFn: async () => {
      // First get cases for this client
      const { data: cases, error: casesError } = await supabase
        .from('cases')
        .select('id')
        .eq('client_id', clientId);

      if (casesError) throw casesError;

      const caseIds = cases?.map(c => c.id) || [];

      // Query for documents directly associated with client OR associated with client's cases
      const queries = [];
      
      // Direct client documents
      queries.push(
        supabase
          .from('documents')
          .select('*')
          .eq('client_id', clientId as any)
      );

      // Documents from client's cases (stored in metadata)
      if (caseIds.length > 0) {
        for (const caseId of caseIds) {
          queries.push(
            supabase
              .from('documents')
              .select('*')
              .contains('metadata', { case_id: caseId })
          );
        }
      }

      // Execute all queries
      const results = await Promise.all(queries);
      
      // Check for errors
      for (const result of results) {
        if (result.error) throw result.error;
      }

      // Combine all documents and remove duplicates
      const allDocuments = results.flatMap(result => result.data || []);
      const uniqueDocuments = allDocuments.filter((doc, index, self) => 
        index === self.findIndex(d => d.id === doc.id)
      );

      return uniqueDocuments as any as Document[];
    },
  });
}

export function useDocumentsByCase(caseId: string) {
  return useQuery({
    queryKey: ['documents', 'case', caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .contains('metadata', { case_id: caseId });

      if (error) throw error;
      return data as any as Document[];
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
        .eq('user_id', userId as any)
        .single();

      const { data, error } = await supabase
        .from('documents')
        .insert({
          ...documentData,
          organization_id: (profile as any)?.organization_id,
          created_by: userId,
        } as any)
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

export function useUploadDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ name, file, case_id, metadata }: UploadDocumentData) => {
      const userId = await getCurrentUserId();
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', userId as any)
        .single();

      const orgId = (profile as any)?.organization_id;
      if (!orgId) throw new Error('User organization not found');

      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${orgId}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      
      // Upload file to storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Create document record in database
      const documentData = {
        name,
        content: '', // For uploaded files, content might be empty initially
        organization_id: orgId,
        created_by: userId,
        file_path: uploadData.path,
        file_size: file.size,
        mime_type: file.type,
        metadata: {
          ...metadata,
          ...(case_id && { case_id }),
          original_filename: file.name,
        },
      };

      const { data, error } = await supabase
        .from('documents')
        .insert(documentData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      if (variables.case_id) {
        queryClient.invalidateQueries({ queryKey: ['documents', 'case', variables.case_id] });
      }
      toast({
        title: "Success",
        description: "Document uploaded successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: error.message || "Failed to upload document.",
      });
    },
  });
}
