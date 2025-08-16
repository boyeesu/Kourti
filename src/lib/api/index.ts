import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient, UseQueryOptions, QueryKey } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { sanitizeErrorForLogging } from '@/lib/utils';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { useUserOrganization } from '@/hooks/useUserOrganization';

// Error handling and type constants
export class APIError extends Error {
  statusCode?: number;
  
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
  }
}

// Default error messages
const DEFAULT_ERROR_MESSAGES = {
  fetch: 'Failed to load data. Please try again.',
  create: 'Failed to create item. Please try again.',
  update: 'Failed to update item. Please try again.',
  delete: 'Failed to delete item. Please try again.',
  notFound: 'The requested resource was not found.',
  unauthorized: 'You do not have permission to perform this action.',
  server: 'A server error occurred. Please try again later.',
  network: 'Network error. Please check your connection and try again.',
};

// Generic fetch data function
export async function fetchData<T>({
  table,
  query = {},
  select = '*',
  filters = {},
  order = { column: 'created_at', ascending: false },
  pagination = { page: 1, pageSize: 20 },
  transform,
}: {
  table: string;
  query?: Record<string, any>;
  select?: string;
  filters?: Record<string, any>;
  order?: { column: string; ascending: boolean };
  pagination?: { page: number; pageSize: number };
  transform?: (data: any) => T;
}): Promise<{ data: T; count: number }> {
  try {
    const from = (pagination.page - 1) * pagination.pageSize;
    const to = from + pagination.pageSize - 1;
    
    let queryBuilder = supabase
      .from(table)
      .select(select, { count: 'exact' });
    
    // Apply filters
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') {
        queryBuilder = queryBuilder.eq(key, value);
      }
    }
    
    // Apply additional query parameters
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        if (typeof value === 'function') {
          queryBuilder = value(queryBuilder);
        }
      }
    }
    
    // Apply order
    queryBuilder = queryBuilder.order(order.column, { ascending: order.ascending });
    
    // Apply pagination
    queryBuilder = queryBuilder.range(from, to);
    
    const { data, error, count } = await queryBuilder;
    
    if (error) {
      throw new APIError(error.message, error.code === '42P01' ? 404 : 500);
    }
    
    const result = transform ? transform(data) : data;
    
    return { data: result as T, count: count || 0 };
  } catch (error: any) {
    console.error('API Error:', sanitizeErrorForLogging(error));
    
    if (error instanceof APIError) {
      throw error;
    }
    
    // Map common errors to user-friendly messages
    if (error.message?.includes('network') || error.code === 'NETWORK_ERROR') {
      throw new APIError(DEFAULT_ERROR_MESSAGES.network);
    } else if (error.code === 'PGRST301' || error.message?.includes('not found')) {
      throw new APIError(DEFAULT_ERROR_MESSAGES.notFound, 404);
    } else if (error.code === '403' || error.message?.includes('permission')) {
      throw new APIError(DEFAULT_ERROR_MESSAGES.unauthorized, 403);
    }
    
    throw new APIError(DEFAULT_ERROR_MESSAGES.fetch);
  }
}

// Generic create item function
export async function createItem<T>({
  table,
  data,
  returnFields = '*',
  organizationId,
}: {
  table: string;
  data: Record<string, any>;
  returnFields?: string;
  organizationId?: string;
}): Promise<T> {
  try {
    const userId = await getCurrentUserId();
    
    // Add metadata to all items
    const itemData = {
      ...data,
      organization_id: organizationId || data.organization_id,
      created_by: userId,
    };
    
    const { data: result, error } = await supabase
      .from(table)
      .insert(itemData)
      .select(returnFields)
      .single();
    
    if (error) {
      throw new APIError(error.message, error.code === '23505' ? 409 : 500);
    }
    
    return result as T;
  } catch (error: any) {
    console.error('API Error:', sanitizeErrorForLogging(error));
    
    if (error instanceof APIError) {
      throw error;
    }
    
    // Handle common errors
    if (error.code === '23505') { // Unique violation
      throw new APIError('This item already exists.', 409);
    } else if (error.code === '23503') { // Foreign key violation
      throw new APIError('Referenced item does not exist.', 400);
    } else if (error.code === '23502') { // Not null violation
      throw new APIError('Missing required fields.', 400);
    }
    
    throw new APIError(DEFAULT_ERROR_MESSAGES.create);
  }
}

// Generic update item function
export async function updateItem<T>({
  table,
  id,
  data,
  returnFields = '*',
}: {
  table: string;
  id: string;
  data: Record<string, any>;
  returnFields?: string;
}): Promise<T> {
  try {
    // Always update the updated_at timestamp
    const updateData = {
      ...data,
      updated_at: new Date().toISOString(),
    };
    
    const { data: result, error } = await supabase
      .from(table)
      .update(updateData)
      .eq('id', id)
      .select(returnFields)
      .single();
    
    if (error) {
      throw new APIError(error.message, 500);
    }
    
    return result as T;
  } catch (error: any) {
    console.error('API Error:', sanitizeErrorForLogging(error));
    
    if (error instanceof APIError) {
      throw error;
    }
    
    throw new APIError(DEFAULT_ERROR_MESSAGES.update);
  }
}

// Generic delete item function
export async function deleteItem({
  table,
  id,
}: {
  table: string;
  id: string;
}): Promise<void> {
  try {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id);
    
    if (error) {
      throw new APIError(error.message, 500);
    }
  } catch (error: any) {
    console.error('API Error:', sanitizeErrorForLogging(error));
    
    if (error instanceof APIError) {
      throw error;
    }
    
    throw new APIError(DEFAULT_ERROR_MESSAGES.delete);
  }
}

// Generic get item by ID function
export async function getItemById<T>({
  table,
  id,
  select = '*',
}: {
  table: string;
  id: string;
  select?: string;
}): Promise<T> {
  try {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq('id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        throw new APIError(`${table} not found.`, 404);
      }
      throw new APIError(error.message, 500);
    }
    
    if (!data) {
      throw new APIError(`${table} not found.`, 404);
    }
    
    return data as T;
  } catch (error: any) {
    console.error('API Error:', sanitizeErrorForLogging(error));
    
    if (error instanceof APIError) {
      throw error;
    }
    
    throw new APIError(DEFAULT_ERROR_MESSAGES.fetch);
  }
}

// ============== React Query Hooks ==============

/**
 * Custom hook for fetching data with React Query and consistent error handling
 */
export function useApiQuery<T>({
  queryKey,
  queryFn,
  options = {},
  successToast,
  errorToast = DEFAULT_ERROR_MESSAGES.fetch,
}: {
  queryKey: QueryKey;
  queryFn: () => Promise<T>;
  options?: Omit<UseQueryOptions<T, Error, T, QueryKey>, 'queryKey' | 'queryFn'>;
  successToast?: string;
  errorToast?: string;
}) {
  const { toast } = useToast();
  
  return useQuery<T, Error>({
    queryKey,
    queryFn,
    ...options,
    onSuccess: (data) => {
      if (successToast) {
        toast({
          title: 'Success',
          description: successToast,
        });
      }
      
      if (options.onSuccess) {
        options.onSuccess(data);
      }
    },
    onError: (error) => {
      if (errorToast) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: error instanceof APIError ? error.message : errorToast,
        });
      }
      
      if (options.onError) {
        options.onError(error);
      }
    },
  });
}

/**
 * Custom hook for mutations with React Query and consistent error handling
 */
export function useApiMutation<TData, TVariables>({
  mutationFn,
  options = {},
  successToast,
  errorToast,
}: {
  mutationFn: (variables: TVariables) => Promise<TData>;
  options?: any;
  successToast?: string;
  errorToast?: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation<TData, Error, TVariables>({
    mutationFn,
    ...options,
    onSuccess: (data, variables, context) => {
      if (successToast) {
        toast({
          title: 'Success',
          description: successToast,
        });
      }
      
      if (options.onSuccess) {
        options.onSuccess(data, variables, context);
      }
      
      if (options.invalidateQueries) {
        queryClient.invalidateQueries({ queryKey: options.invalidateQueries });
      }
    },
    onError: (error, variables, context) => {
      const message = error instanceof APIError ? error.message : (errorToast || DEFAULT_ERROR_MESSAGES.fetch);
      
      toast({
        variant: 'destructive',
        title: 'Error',
        description: message,
      });
      
      if (options.onError) {
        options.onError(error, variables, context);
      }
    },
  });
}

/**
 * Hook for using fetchData with React Query
 */
export function useFetchData<T>({
  table,
  queryKey,
  select = '*',
  filters = {},
  query = {},
  order = { column: 'created_at', ascending: false },
  pagination = { page: 1, pageSize: 20 },
  transform,
  options = {},
  requireOrg = true,
}: {
  table: string;
  queryKey: QueryKey;
  select?: string;
  filters?: Record<string, any>;
  query?: Record<string, any>;
  order?: { column: string; ascending: boolean };
  pagination?: { page: number; pageSize: number };
  transform?: (data: any) => T;
  options?: Omit<UseQueryOptions<{ data: T; count: number }, Error, { data: T; count: number }, QueryKey>, 'queryKey' | 'queryFn'>;
  requireOrg?: boolean;
}) {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();
  
  // Add organization filter if required
  const allFilters = requireOrg 
    ? { ...filters, organization_id: organizationId } 
    : filters;
  
  return useApiQuery<{ data: T; count: number }>({
    queryKey,
    queryFn: () => fetchData<T>({
      table,
      select,
      filters: allFilters,
      query,
      order,
      pagination,
      transform,
    }),
    options: {
      ...options,
      enabled: requireOrg ? !!organizationId && !orgLoading && !orgError : true,
    },
  });
}

/**
 * Hook for creating items with React Query
 */
export function useCreateItem<T>({
  table,
  invalidateQueries,
  returnFields = '*',
  successToast = 'Item created successfully.',
  errorToast = DEFAULT_ERROR_MESSAGES.create,
  options = {},
}: {
  table: string;
  invalidateQueries: QueryKey[];
  returnFields?: string;
  successToast?: string;
  errorToast?: string;
  options?: any;
}) {
  const { data: organizationId } = useUserOrganization();
  
  return useApiMutation<T, Record<string, any>>({
    mutationFn: (data) => createItem<T>({ 
      table, 
      data, 
      returnFields,
      organizationId: organizationId as string,
    }),
    options: {
      ...options,
      invalidateQueries,
    },
    successToast,
    errorToast,
  });
}

/**
 * Hook for updating items with React Query
 */
export function useUpdateItem<T>({
  table,
  invalidateQueries,
  returnFields = '*',
  successToast = 'Item updated successfully.',
  errorToast = DEFAULT_ERROR_MESSAGES.update,
  options = {},
}: {
  table: string;
  invalidateQueries: QueryKey[];
  returnFields?: string;
  successToast?: string;
  errorToast?: string;
  options?: any;
}) {
  return useApiMutation<T, { id: string; data: Record<string, any> }>({
    mutationFn: ({ id, data }) => updateItem<T>({ 
      table, 
      id, 
      data, 
      returnFields 
    }),
    options: {
      ...options,
      invalidateQueries,
    },
    successToast,
    errorToast,
  });
}

/**
 * Hook for deleting items with React Query
 */
export function useDeleteItem({
  table,
  invalidateQueries,
  successToast = 'Item deleted successfully.',
  errorToast = DEFAULT_ERROR_MESSAGES.delete,
  options = {},
}: {
  table: string;
  invalidateQueries: QueryKey[];
  successToast?: string;
  errorToast?: string;
  options?: any;
}) {
  return useApiMutation<void, string>({
    mutationFn: (id) => deleteItem({ table, id }),
    options: {
      ...options,
      invalidateQueries,
    },
    successToast,
    errorToast,
  });
}

/**
 * Hook for getting item by ID with React Query
 */
export function useGetItemById<T>({
  table,
  id,
  select = '*',
  options = {},
  errorToast = DEFAULT_ERROR_MESSAGES.fetch,
}: {
  table: string;
  id: string | null | undefined;
  select?: string;
  options?: Omit<UseQueryOptions<T, Error, T, QueryKey>, 'queryKey' | 'queryFn'>;
  errorToast?: string;
}) {
  return useApiQuery<T>({
    queryKey: [table, 'detail', id],
    queryFn: () => getItemById<T>({ table, id: id as string, select }),
    options: {
      ...options,
      enabled: !!id && options.enabled !== false,
    },
    errorToast,
  });
}