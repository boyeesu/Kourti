import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { invokeNodeApi } from '@/lib/backendApi';
import { logError } from '@/lib/logger';
import { usePlatformAdmin } from './usePlatformAdmin';

type QueryValue = string | number | boolean | null | undefined;

export interface KbChunkSummary {
  id: string;
  entry_id: string;
  title: string;
  category: string;
  chunk_index: number;
  content_preview: string;
  token_count: number | null;
  has_embedding: boolean;
  created_at: string;
}

export interface KbChunkListResponse {
  total: number;
  limit: number;
  offset: number;
  chunks: KbChunkSummary[];
}

export interface KbChunkDetail {
  id: string;
  entry_id: string;
  title: string;
  category: string;
  chunk_index: number;
  content: string;
  token_count: number | null;
  has_embedding: boolean;
  created_at: string;
}

export interface KbRetrievalMatch {
  entry_id: string;
  title: string;
  category: string;
  similarity: number;
  content_preview: string;
}

export interface KbRetrievalResponse {
  query: string;
  count: number;
  matches: KbRetrievalMatch[];
}

const KB_KEY = ['admin', 'kb', 'chunks'] as const;

/** List KB chunks with optional text search + pagination. */
export function useKbChunks(params: { q?: string; limit?: number; offset?: number }) {
  const { data: isPlatformAdmin } = usePlatformAdmin();
  return useQuery({
    queryKey: [...KB_KEY, params],
    enabled: !!isPlatformAdmin,
    staleTime: 10 * 1000,
    queryFn: async () => {
      try {
        return await invokeNodeApi<KbChunkListResponse>('/api/v1/admin/kb/chunks', {
          query: params as Record<string, QueryValue>,
        });
      } catch (error) {
        logError('Error fetching KB chunks', error);
        throw error;
      }
    },
  });
}

/** Create a new chunk. Requires a reason. */
export function useCreateKbChunk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      content: string;
      source?: string;
      title?: string;
      category?: string;
      reason: string;
    }) => invokeNodeApi('/api/v1/admin/kb/chunks', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KB_KEY });
      toast.success('Chunk created');
    },
    onError: (error) =>
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to create chunk',
      }),
  });
}

/** Update an existing chunk (re-embeds when content/title changes). */
export function useUpdateKbChunk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      content?: string;
      source?: string;
      title?: string;
      category?: string;
      reason: string;
    }) => invokeNodeApi(`/api/v1/admin/kb/chunks/${id}`, { method: 'PUT', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KB_KEY });
      toast.success('Chunk updated');
    },
    onError: (error) =>
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to update chunk',
      }),
  });
}

/** Delete a chunk. Requires a reason (sent in the request body). */
export function useDeleteKbChunk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      invokeNodeApi(`/api/v1/admin/kb/chunks/${id}`, { method: 'DELETE', body: { reason } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KB_KEY });
      toast.success('Chunk deleted');
    },
    onError: (error) =>
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to delete chunk',
      }),
  });
}

/** Preview the exact retrieval MARTHA would ground on for a query. */
export function useKbTestRetrieval() {
  return useMutation({
    mutationFn: (params: { query: string; limit?: number }) =>
      invokeNodeApi<KbRetrievalResponse>('/api/v1/admin/kb/test-retrieval', {
        method: 'POST',
        body: params,
      }),
    onError: (error) =>
      toast.error('Retrieval failed', {
        description: error instanceof Error ? error.message : 'Failed to run retrieval',
      }),
  });
}

/** Trigger a full re-ingest of the KB from source. Requires a reason. */
export function useKbReingest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { reason: string }) =>
      invokeNodeApi<{ queued: boolean; message: string }>('/api/v1/admin/kb/reingest', {
        method: 'POST',
        body: params,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: KB_KEY });
      if (data.queued) toast.success('Re-ingest started', { description: data.message });
      else toast.warning('Re-ingest not started', { description: data.message });
    },
    onError: (error) =>
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to trigger re-ingest',
      }),
  });
}
