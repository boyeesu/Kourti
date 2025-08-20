import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { getCurrentUserId } from '@/hooks/useCurrentUser';

// Types for the API hooks
type FetchDataOptions = {
  table: string;
  select?: string;
  filters?: Record<string, any>;
  page?: number;
  pageSize?: number;
  orderBy?: { column: string; ascending?: boolean };
  queryKey?: string[];
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
}: FetchDataOptions) {
  const { data: organizationId } = useUserOrganization();
  const { toast } = useToast();

  return useQuery({
    queryKey: [...queryKey, page, pageSize, JSON.stringify(filters), organizationId],
    queryFn: async () => {
      try {
        // No mock data - always fetch from database

        if (!organizationId) {
          throw new Error('No organization ID found');
        }

        // Calculate pagination range
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        // Build the query
        let query = supabase.from(table).select(select, { count: 'exact' });

        // Add organization filter by default
        query = query.eq('organization_id', organizationId);

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
        console.error(`Error fetching ${table}:`, error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: `Failed to load ${table}. Please try again later.`,
        });

        // Return empty data structure
        return { data: [], count: 0, error };
      }
    },
    enabled: !!organizationId,
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
          .eq('user_id', userId)
          .single();
          
        if (profileError) {
          throw new Error('Could not retrieve user profile');
        }
        
        if (!profile?.organization_id) {
          throw new Error('No organization associated with account');
        }
        
        // Insert the item with organization and user info
        const { data: insertedData, error } = await supabase
          .from(table)
          .insert({
            ...data,
            organization_id: profile.organization_id,
            created_by: userId,
          })
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
          .from(table)
          .update({
            ...data,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
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
      queryClient.invalidateQueries({ queryKey: [`${table}-item`, data.id] });
      
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
          .from(table)
          .delete()
          .eq('id', id);

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