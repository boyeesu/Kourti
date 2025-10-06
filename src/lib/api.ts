import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { buildQueryKey } from '@/utils/query-helpers';
import { logError } from '@/lib/logger';

// Types for the API hooks
type FetchDataOptions = {
  table: string;
  select?: string;
  filters?: Record<string, any>;
  page?: number;
  pageSize?: number;
  orderBy?: { column: string; ascending?: boolean };
  queryKey?: string[];
  organizationColumn?: string | false;
};

type ItemData = Record<string, any>;

type MutationOptions = {
  table: string;
  onSuccess?: (data: any) => void;
  onError?: (error: Error) => void;
};

/**
 * Hook for fetching data from Supabase with pagination and filtering
 */
export function useFetchData<T = any>({
  table,
  select = '*',
  filters = {},
  page = 1,
  pageSize = 10,
  orderBy = { column: 'created_at', ascending: false },
  queryKey = [table],
  organizationColumn = 'organization_id',
}: FetchDataOptions) {
  const { data: organizationId } = useUserOrganization();
  const { toast } = useToast();

  const shouldFilterByOrganization = typeof organizationColumn === 'string' && organizationColumn.length > 0;
  const queryKeyValue = buildQueryKey(queryKey, {
    page,
    pageSize,
    filters,
    organizationId: shouldFilterByOrganization ? organizationId : undefined,
  });

  return useQuery({
    queryKey: queryKeyValue,
    queryFn: async () => {
      try {
        if (shouldFilterByOrganization && !organizationId) {
          throw new Error('No organization ID found');
        }

        // Calculate pagination range
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        // Build the query
        let query = supabase.from(table as any).select(select, { count: 'exact' });

        // Add organization filter by default
        if (shouldFilterByOrganization && organizationId) {
          query = query.eq(organizationColumn, organizationId);
        }

        // Add any custom filters
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            if (Array.isArray(value)) {
              query = query.in(key, value);
            } else if (typeof value === 'object' && value.operator) {
              // Handle complex filter objects
              switch (value.operator) {
                case 'eq':
                  query = query.eq(key, value.value);
                  break;
                case 'neq':
                  query = query.neq(key, value.value);
                  break;
                case 'gt':
                  query = query.gt(key, value.value);
                  break;
                case 'gte':
                  query = query.gte(key, value.value);
                  break;
                case 'lt':
                  query = query.lt(key, value.value);
                  break;
                case 'lte':
                  query = query.lte(key, value.value);
                  break;
                case 'like':
                  query = query.like(key, `%${value.value}%`);
                  break;
                case 'ilike':
                  query = query.ilike(key, `%${value.value}%`);
                  break;
                case 'in':
                  query = query.in(key, value.value);
                  break;
                default:
                  query = query.eq(key, value.value);
              }
            } else {
              query = query.eq(key, value);
            }
          }
        });

        // Add ordering
        if (orderBy) {
          query = query.order(orderBy.column, { ascending: orderBy.ascending });
        }

        // Add pagination
        query = query.range(from, to);

        // Execute the query
        const { data, count, error } = await query;

        if (error) throw error;

        return { data: data as T[], count: count || 0, error: null };
      } catch (error) {
        logError(`Error fetching ${table}`, { error });
        toast({
          variant: 'destructive',
          title: 'Error',
          description: `Failed to load ${table}. Please try again later.`,
        });

        // Return empty data structure
        return { data: [], count: 0, error };
      }
    },
    enabled: shouldFilterByOrganization ? !!organizationId : true,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook for creating an item
 */
export function useCreateItem({ table, onSuccess, onError }: MutationOptions) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: ItemData) => {
      try {
        // No mock data - always use database

        const userId = await getCurrentUserId();
        
        if (!userId) {
          throw new Error('User is not authenticated');
        }
        
        // Get user's organization
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('user_id', userId as any)
          .single();
          
        if (profileError) {
          throw new Error('Could not retrieve user profile');
        }
        
        if (!(profile as any)?.organization_id) {
          throw new Error('No organization associated with account');
        }
        
        // Insert the item with organization and user info
        const { data: insertedData, error } = await supabase
          .from(table as any)
          .insert({
            ...data,
            organization_id: (profile as any).organization_id,
            created_by: userId,
          } as any)
          .select()
          .single();

        if (error) throw error;
        
        return insertedData;
      } catch (error) {
        console.error(`Error creating ${table}:`, error);
        throw error;
      }
    },
    onSuccess: (data) => {
      // Invalidate relevant queries to refresh the data
      queryClient.invalidateQueries({ queryKey: [table] });
      
      toast({
        title: 'Success',
        description: `${table.charAt(0).toUpperCase() + table.slice(1, -1)} created successfully.`,
      });
      
      if (onSuccess) onSuccess(data);
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: `Failed to create ${table.slice(0, -1)}: ${error.message}`,
      });
      
      if (onError) onError(error);
    },
  });
}

/**
 * Hook for updating an existing item
 */
export function useUpdateItem({ table, onSuccess, onError }: MutationOptions) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...data }: ItemData & { id: string }) => {
      try {
        // No mock data - always use database

        const { data: updatedData, error } = await supabase
          .from(table as any)
          .update({
            ...data,
            updated_at: new Date().toISOString(),
          } as any)
          .eq('id', id as any)
          .select()
          .single();

        if (error) throw error;
        
        return updatedData;
      } catch (error) {
        console.error(`Error updating ${table}:`, error);
        throw error;
      }
    },
    onSuccess: (data) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: [table] });
      queryClient.invalidateQueries({ queryKey: [`${table}-item`, (data as any).id] });
      
      toast({
        title: 'Success',
        description: `${table.charAt(0).toUpperCase() + table.slice(1, -1)} updated successfully.`,
      });
      
      if (onSuccess) onSuccess(data);
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: `Failed to update ${table.slice(0, -1)}: ${error.message}`,
      });
      
      if (onError) onError(error);
    },
  });
}

/**
 * Hook for fetching a single item by ID
 */
export function useGetItemById<T = any>({
  table,
  id,
  select = '*',
  queryKey,
}: {
  table: string;
  id: string;
  select?: string;
  queryKey?: string[];
}) {
  const { data: organizationId } = useUserOrganization();
  const { toast } = useToast();

  return useQuery({
    queryKey: queryKey || [`${table}-item`, id],
    queryFn: async () => {
      try {
        if (!organizationId) {
          throw new Error('No organization ID found');
        }

        if (!id) {
          throw new Error('No ID provided');
        }

        // Build the query
        let query = supabase.from(table as any).select(select);

        // Add organization filter by default for most tables
        if (table !== 'invoice_items' && table !== 'time_entries') {
          query = query.eq('organization_id', organizationId);
        }

        // Add ID filter
        if (table === 'invoice_items') {
          // For invoice_items, filter by invoice_id instead of id
          query = query.eq('invoice_id', id as any);
        } else {
          query = query.eq('id', id as any);
        }

        // Execute the query
        const { data, error } = await query;

        if (error) throw error;

        // For invoice_items, return the array, for others return single item
        if (table === 'invoice_items') {
          return data as T[];
        } else {
          return data?.[0] as T;
        }
      } catch (error) {
        console.error(`Error fetching ${table} item:`, error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: `Failed to load ${table} item. Please try again later.`,
        });
        throw error;
      }
    },
    enabled: !!organizationId && !!id,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook for deleting an item
 */
export function useDeleteItem({ table, onSuccess, onError }: MutationOptions) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      try {
        // No mock data - always use database

        const { error } = await supabase
          .from(table as any)
          .delete()
          .eq('id', id as any);

        if (error) throw error;
        
        return { success: true, id };
      } catch (error) {
        console.error(`Error deleting ${table}:`, error);
        throw error;
      }
    },
    onSuccess: (result) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: [table] });
      
      toast({
        title: 'Success',
        description: `${table.charAt(0).toUpperCase() + table.slice(1, -1)} deleted successfully.`,
      });
      
      if (onSuccess) onSuccess(result);
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: `Failed to delete ${table.slice(0, -1)}: ${error.message}`,
      });
      
      if (onError) onError(error);
    },
  });
}