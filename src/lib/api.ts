import { useQuery, UseQueryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";

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
        .select(options.select || "*", { count: "exact" })
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
        .select("*", { count: "exact", head: true })
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
