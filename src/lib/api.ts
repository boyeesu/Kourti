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
        // For development/demo mode, return mock data
        if (import.meta.env.VITE_ENABLE_DEVELOPMENT_FEATURES === 'true') {
          console.log(`📋 Using mock data for ${table}`);
          
          // Return mock data structure
          return {
            data: Array(Math.min(pageSize, 5)).fill(null).map((_, index) => ({
              id: `mock-${index + 1}`,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              organization_id: '123e4567-e89b-12d3-a456-426614174000',
              // Add table-specific mock fields
              ...(table === 'invoices' ? {
                invoice_number: `INV-${2025}${String(index + 1).padStart(4, '0')}`,
                client_id: `client-${index + 1}`,
                status: ['draft', 'sent', 'paid', 'overdue'][index % 4],
                issue_date: new Date().toISOString(),
                due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
                total_amount: (1000 * (index + 1)),
                notes: 'This is a mock invoice for demonstration purposes',
                client: { id: `client-${index + 1}`, name: `Mock Client ${index + 1}` }
              } : {}),
            })),
            count: 15, // Mock total count
            error: null
          };
        }

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
        // For development/demo mode
        if (import.meta.env.VITE_ENABLE_DEVELOPMENT_FEATURES === 'true') {
          console.log(`✅ Mock create for ${table}:`, data);
          
          // Return mock created item
          return {
            ...data,
            id: `mock-${Date.now()}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        }

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
        // For development/demo mode
        if (import.meta.env.VITE_ENABLE_DEVELOPMENT_FEATURES === 'true') {
          console.log(`🔄 Mock update for ${table}:`, { id, ...data });
          
          // Return mock updated item
          return {
            id,
            ...data,
            updated_at: new Date().toISOString(),
          };
        }

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
        // For development/demo mode
        if (import.meta.env.VITE_ENABLE_DEVELOPMENT_FEATURES === 'true') {
          console.log(`❌ Mock delete for ${table}:`, id);
          return { success: true, id };
        }

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