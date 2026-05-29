import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Document } from '@/types';
import { logError } from '@/lib/logger';
import { invokeNodeApi } from '@/lib/backendApi';
import { uploadDocument as uploadDocumentBytes } from '@/lib/fileApi';

/** JSON-compatible value */
type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface CreateDocumentData {
  name: string;
  content: string;
  summary?: string;
  metadata?: Json;
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
  sha256?: string;
}

export interface UploadDocumentData {
  name: string;
  file: File;
  case_id?: string;
  metadata?: Json;
  summary?: string;
  contract_type?: string;
  effective_date?: string;
  renewal_date?: string;
  termination_date?: string;
  value?: number;
  currency?: string;
  terms?: string;
}

interface DocumentsResult {
  documents: Document[];
  count: number;
}

export function useDocuments() {
  return useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const response = await invokeNodeApi<DocumentsResult>('/api/v1/documents', {
        query: {
          page: 1,
          pageSize: 1000,
        },
      });
      return response.documents;
    },
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: ['document', id],
    queryFn: async () => {
      return invokeNodeApi<Document>(`/api/v1/documents/${id}`);
    },
  });
}

export function useDocumentsByClient(clientId: string) {
  return useQuery({
    queryKey: ['documents', 'client', clientId],
    queryFn: async () => {
      const response = await invokeNodeApi<DocumentsResult>('/api/v1/documents', {
        query: {
          page: 1,
          pageSize: 1000,
          clientId,
        },
      });
      return response.documents;
    },
  });
}

export function useDocumentsByCase(caseId: string) {
  return useQuery({
    queryKey: ['documents', 'case', caseId],
    queryFn: async () => {
      const response = await invokeNodeApi<DocumentsResult>('/api/v1/documents', {
        query: {
          page: 1,
          pageSize: 1000,
          caseId,
        },
      });
      return response.documents;
    },
  });
}

export function useCreateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (documentData: CreateDocumentData) => {
      return invokeNodeApi<Document>('/api/v1/documents', {
        method: 'POST',
        body: documentData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast.success('Success', { description: 'Document created successfully.' });
    },
    onError: (error: Error) => {
      logError('Failed to create document', { error });
      toast.error('Error', { description: error.message || 'Failed to create document.' });
    },
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      name,
      file,
      case_id,
      metadata,
      summary,
      contract_type,
      effective_date,
      renewal_date,
      termination_date,
      value,
      currency,
      terms,
    }: UploadDocumentData) => {
      // Validate file before upload
      const { validateFile } = await import('@/lib/fileValidation');
      const validation = validateFile(file);
      if (!validation.valid) {
        throw new Error(validation.error || 'File validation failed');
      }

      // Push the bytes to storage first so the documents row carries an
      // actual file_path (and the sha256 we'll verify on every read).
      // Prior versions of this hook skipped the upload entirely, which
      // is why every legacy document row in production references a
      // path that never had bytes behind it.
      const uploaded = await uploadDocumentBytes(file);

      // Build document data for the Node backend
      const documentData = {
        name,
        content: '',
        file_path: uploaded.filePath,
        sha256: uploaded.sha256,
        file_size: file.size,
        mime_type: file.type,
        ...(summary ? { summary } : {}),
        ...(contract_type ? { contract_type } : {}),
        ...(effective_date ? { effective_date } : {}),
        ...(renewal_date ? { renewal_date } : {}),
        ...(termination_date ? { termination_date } : {}),
        ...(value !== undefined ? { value } : {}),
        ...(currency ? { currency } : {}),
        ...(terms ? { terms } : {}),
        metadata: {
          ...((metadata as Record<string, unknown>) ?? {}),
          ...(case_id && { case_id }),
          original_filename: file.name,
        } as Json,
        client_id:
          metadata && typeof metadata === 'object'
            ? (metadata as Record<string, unknown>).client_id
            : undefined,
      };

      return invokeNodeApi<Document>('/api/v1/documents', {
        method: 'POST',
        body: documentData,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      if (variables.case_id) {
        queryClient.invalidateQueries({ queryKey: ['documents', 'case', variables.case_id] });
      }
      toast.success('Success', { description: 'Document uploaded successfully.' });
    },
    onError: (error: Error) => {
      logError('Failed to upload document', { error });
      toast.error('Upload Failed', { description: error.message || 'Failed to upload document.' });
    },
  });
}
