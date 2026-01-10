import { useQuery, useMutation, useQueryClient, UseQueryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { useToast } from "@/hooks/use-toast";

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
 * Generic hook for fetching data from Supabase with organization scoping
 */
export function useFetchData<T = unknown>(
  options: FetchDataOptions,
  queryOptions?: Omit<UseQueryOptions<FetchDataResult<T>, Error>, "queryKey" | "queryFn">
) {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  return useQuery<FetchDataResult<T>, Error>({
    queryKey: [...options.queryKey, organizationId],
    queryFn: async (): Promise<FetchDataResult<T>> => {
      if (!organizationId) {
        return { data: null, count: 0 };
      }

      let query = supabase
        .from(options.table)
        .select(options.select || "*", { count: "exact" } as any)
        .eq("organization_id", organizationId);

      // Apply additional filters
      if (options.filters) {
        Object.entries(options.filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            query = query.eq(key, value);
          }
        });
      }

      // Apply ordering
      if (options.orderBy) {
        query = query.order(options.orderBy.column, {
          ascending: options.orderBy.ascending ?? false,
        });
      }

      // Apply limit
      if (options.limit) {
        query = query.limit(options.limit);
      }

      // Execute query
      if (options.single) {
        const { data, error, count } = await query.single();
        if (error) throw error;
        return { data: data as T, count };
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data as T, count };
    },
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
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
    queryKey: [...queryKey, "count", organizationId],
    queryFn: async () => {
      if (!organizationId) return 0;

      let query = supabase
        .from(table)
        .select("*", { count: "exact", head: true } as any)
        .eq("organization_id", organizationId);

      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            query = query.eq(key, value);
          }
        });
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
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
        throw new Error("Organization ID or item ID is missing");
      }

      const { data, error } = await supabase
        .from(options.table)
        .select(options.select || "*")
        .eq("id", options.id)
        .eq("organization_id", organizationId)
        .single();

      if (error) throw error;
      return data as T;
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
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (updateData: { id: string; [key: string]: unknown }) => {
      const { id, ...data } = updateData;
      const { data: result, error } = await supabase
        .from(options.table)
        .update(data as any)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result as T;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [options.table] });
      options.onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update item.",
      });
      options.onError?.(error);
    },
  });
}
