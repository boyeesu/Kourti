/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { invokeNodeApi } from '@/lib/backendApi';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { toast } from 'sonner';

export interface FetchDataOptions {
  table: string;
  queryKey: string[];
  select?: string;
  filters?: Record<string, unknown>;
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
  single?: boolean;
}

export interface FetchDataResult<T> {
  data: T | null;
  count: number | null;
}

/**
 * Generic hook for fetching data from the Node backend with organization scoping.
 *
 * The backend is expected to support query parameters for filtering, ordering, etc.
 * The `table` field is used as the REST resource name.
 */
export function useFetchData<T = unknown>(
  options: FetchDataOptions,
  queryOptions?: Omit<UseQueryOptions<FetchDataResult<T>, Error>, 'queryKey' | 'queryFn'>
) {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  return useQuery<FetchDataResult<T>, Error>({
    queryKey: [...options.queryKey, organizationId],
    queryFn: async (): Promise<FetchDataResult<T>> => {
      if (!organizationId) {
        return { data: null, count: 0 };
      }

      // Build query parameters from options
      const query: Record<string, string | number | boolean> = {
        organization_id: organizationId,
      };

      if (options.select) {
        query.select = options.select;
      }

      if (options.filters) {
        Object.entries(options.filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            query[key] = value as string | number | boolean;
          }
        });
      }

      if (options.orderBy) {
        query.orderBy = options.orderBy.column;
        query.ascending = options.orderBy.ascending ?? false;
      }

      if (options.limit) {
        query.limit = options.limit;
      }

      if (options.single) {
        query.single = true;
      }

      const data = await invokeNodeApi<{ data: T; count: number | null }>(
        `/api/v1/data/${options.table}`,
        {
          query,
        }
      );

      return {
        data: (data as any)?.data ?? (data as unknown as T),
        count: (data as any)?.count ?? null,
      };
    },
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    ...queryOptions,
  });
}

/**
 * Fetch count for a specific table with optional filters
 */
export function useFetchCount(
  table: string,
  queryKey: string[],
  filters?: Record<string, unknown>
) {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  return useQuery<number, Error>({
    queryKey: [...queryKey, 'count', organizationId],
    queryFn: async () => {
      if (!organizationId) return 0;

      const query: Record<string, string | number | boolean> = {
        organization_id: organizationId,
        count_only: true,
      };

      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            query[key] = value as string | number | boolean;
          }
        });
      }

      const data = await invokeNodeApi<{ count: number }>(`/api/v1/data/${table}`, { query });
      return (data as any)?.count ?? 0;
    },
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Fetch a single item by ID from a table
 */
export function useGetItemById<T = unknown>(options: {
  table: string;
  id: string;
  select?: string;
}) {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  return useQuery<T, Error>({
    queryKey: [options.table, options.id, organizationId],
    queryFn: async () => {
      if (!organizationId || !options.id) {
        throw new Error('Organization ID or item ID is missing');
      }

      const query: Record<string, string> = {};
      if (options.select) {
        query.select = options.select;
      }

      const data = await invokeNodeApi<T>(`/api/v1/data/${options.table}/${options.id}`, { query });
      return data;
    },
    enabled: !!organizationId && !!options.id && !orgLoading && !orgError,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Update an item in a table
 */
export function useUpdateItem<T = unknown>(options: {
  table: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updateData: { id: string; [key: string]: unknown }) => {
      const { id, ...data } = updateData;
      const result = await invokeNodeApi<T>(`/api/v1/data/${options.table}/${id}`, {
        method: 'PATCH',
        body: data,
      });
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [options.table] });
      options.onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error('Error', { description: error.message || 'Failed to update item.' });
      options.onError?.(error);
    },
  });
}
