import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { logError } from '@/lib/logger';
import type { Tables, TablesInsert, TablesUpdate, Json } from '@/integrations/supabase/types';

// Type definitions using database types
type Case = Tables<'cases'>;
type CaseInsert = TablesInsert<'cases'>;
type CaseUpdate = TablesUpdate<'cases'>;

export interface CreateCaseData {
  title: string;
  description?: string;
  case_number?: string;
  status?: string;
  priority?: string;
  assigned_to?: string;
  court?: string;
  next_hearing_date?: string;
  client_id?: string;
  case_type_id?: string;
  custom_fields?: Json;
}

export interface UpdateCaseData extends Partial<CreateCaseData> {
  id: string;
}

// Extended case type with relationships
interface CaseWithRelations extends Case {
  client?: { id: string; name: string } | null;
  assigned_user?: { id: string; first_name: string | null; last_name: string | null } | null;
  case_type?: { id: string; name: string; description: string | null } | null;
}

interface CasesQueryResult {
  cases: CaseWithRelations[];
  count: number;
}

// Request deduplication helper
const pendingMutations = new Map<string, Promise<unknown>>();

function deduplicateMutation<T>(key: string, mutationFn: () => Promise<T>): Promise<T> {
  const existing = pendingMutations.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = mutationFn().finally(() => {
    pendingMutations.delete(key);
  });

  pendingMutations.set(key, promise);
  return promise;
}

/**
 * Hook for fetching paginated cases with optimized query
 */
export function useCases(page = 1, pageSize = 20) {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();
  const [currentPage, setCurrentPage] = useState(page);

  const query = useQuery<CasesQueryResult, Error>({
    queryKey: ['cases', organizationId, currentPage, pageSize],
    queryFn: async (): Promise<CasesQueryResult> => {
      if (!organizationId) {
        return { cases: [], count: 0 };
      }

      try {
        const from = (currentPage - 1) * pageSize;
        const to = currentPage * pageSize - 1;

        // Optimize query to only select the fields we actually need
        const { data, error, count } = await supabase
          .from('cases')
          .select(
            `
            id,
            title,
            description,
            case_number,
            status,
            priority,
            assigned_to,
            court,
            next_hearing_date,
            client_id,
            case_type_id,
            created_at,
            updated_at,
            created_by,
            organization_id,
            custom_fields,
            client:client_id(id, name),
            assigned_user:assigned_to(id, first_name, last_name),
            case_type:case_types(id, name, description)
          `,
            { count: 'exact' }
          )
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .range(from, to);

        if (error) {
          throw error;
        }

        return { cases: (data ?? []) as CaseWithRelations[], count: count ?? 0 };
      } catch (error) {
        logError('Error fetching cases', { error });
        throw error;
      }
    },
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return {
    ...query,
    page: currentPage,
    pageSize,
    setPage: setCurrentPage,
  };
}

/**
 * Hook for fetching a single case by ID
 */
export function useCase(id: string) {
  return useQuery<CaseWithRelations, Error>({
    queryKey: ['case', id],
    queryFn: async (): Promise<CaseWithRelations> => {
      // Optimize query to only select the fields we need
      const { data, error } = await supabase
        .from('cases')
        .select(
          `
          id,
          title,
          description,
          case_number,
          status,
          priority,
          assigned_to,
          court,
          next_hearing_date,
          client_id,
          case_type_id,
          created_at,
          updated_at,
          created_by,
          organization_id,
          custom_fields,
          client:client_id(id, name),
          assigned_user:assigned_to(id, first_name, last_name),
          case_type:case_types(id, name, description)
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as CaseWithRelations;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook for fetching cases by client ID
 */
export function useCasesByClient(clientId: string, page = 1, pageSize = 10) {
  const [currentPage, setCurrentPage] = useState(page);

  const query = useQuery<CasesQueryResult, Error>({
    queryKey: ['cases', 'client', clientId, currentPage, pageSize],
    queryFn: async (): Promise<CasesQueryResult> => {
      const from = (currentPage - 1) * pageSize;
      const to = currentPage * pageSize - 1;

      // Add pagination and select only needed fields
      const { data, error, count } = await supabase
        .from('cases')
        .select(
          `
          id,
          title,
          description,
          case_number,
          status,
          priority,
          assigned_to,
          next_hearing_date,
          created_at,
          updated_at,
          created_by,
          organization_id
        `,
          { count: 'exact' }
        )
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      return {
        cases: (data ?? []) as CaseWithRelations[],
        count: count ?? 0,
      };
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    ...query,
    page: currentPage,
    pageSize,
    setPage: setCurrentPage,
  };
}

/**
 * Hook for creating a new case with optimistic updates and request deduplication
 */
export function useCreateCase() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async (caseData: CreateCaseData) => {
      const userId = await getCurrentUserId();

      if (!userId) {
        throw new Error('User is not authenticated. Please sign in to create a matter.');
      }

      // Use deduplication to prevent double submissions
      const dedupeKey = `create-case-${caseData.title}-${Date.now()}`;

      return deduplicateMutation(dedupeKey, async () => {
        // Get organization ID from user profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('user_id', userId)
          .single();

        if (profileError) {
          throw new Error('Could not retrieve user profile information.');
        }

        if (!profile?.organization_id) {
          throw new Error(
            'No organization associated with your account. Please contact your administrator.'
          );
        }

        const insertData: CaseInsert = {
          ...caseData,
          organization_id: profile.organization_id,
          created_by: userId,
          user_id: userId,
        };

        const { data, error } = await supabase.from('cases').insert(insertData).select().single();

        if (error) {
          throw error;
        }

        return data;
      });
    },
    onSuccess: (data) => {
      // Granular invalidation: only invalidate the current organization's cases
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: ['cases', organizationId],
          exact: false,
        });
      }
      // Also invalidate any client-specific case lists if the case has a client
      if (data?.client_id) {
        queryClient.invalidateQueries({
          queryKey: ['cases', 'client', data.client_id],
          exact: false,
        });
      }
      toast({
        title: 'Success',
        description: 'Matter created successfully.',
      });
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create matter.';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage,
      });
    },
  });
}

/**
 * Hook for updating an existing case with optimistic updates
 */
export function useUpdateCase() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async ({ id, ...updateData }: UpdateCaseData) => {
      // Deduplication to prevent rapid double-clicks
      const dedupeKey = `update-case-${id}`;

      return deduplicateMutation(dedupeKey, async () => {
        const caseUpdate: CaseUpdate = updateData;

        const { data, error } = await supabase
          .from('cases')
          .update(caseUpdate)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return data;
      });
    },
    // Optimistic update
    onMutate: async ({ id, ...updateData }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['case', id] });

      // Snapshot previous value
      const previousCase = queryClient.getQueryData<CaseWithRelations>(['case', id]);

      // Optimistically update the cache
      if (previousCase) {
        queryClient.setQueryData<CaseWithRelations>(['case', id], {
          ...previousCase,
          ...updateData,
          updated_at: new Date().toISOString(),
        });
      }

      return { previousCase };
    },
    onError: (error: unknown, { id }, context) => {
      // Rollback on error
      if (context?.previousCase) {
        queryClient.setQueryData(['case', id], context.previousCase);
      }
      const errorMessage = error instanceof Error ? error.message : 'Failed to update matter.';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage,
      });
    },
    onSuccess: (data) => {
      // Granular invalidation
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: ['cases', organizationId],
          exact: false,
        });
      }
      // Update the specific case in cache with server data
      queryClient.setQueryData(['case', data?.id], data);
      toast({
        title: 'Success',
        description: 'Matter updated successfully.',
      });
    },
  });
}

/**
 * Hook for deleting a case with optimistic updates
 */
export function useDeleteCase() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async (id: string) => {
      // Deduplication to prevent accidental double deletes
      const dedupeKey = `delete-case-${id}`;

      return deduplicateMutation(dedupeKey, async () => {
        const { error } = await supabase.from('cases').delete().eq('id', id);

        if (error) throw error;
        return id;
      });
    },
    // Optimistic update - remove from list immediately
    onMutate: async (id) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['cases'] });

      // Get snapshot of current cases for rollback
      const previousCasesQueries = queryClient.getQueriesData<CasesQueryResult>({
        queryKey: ['cases'],
      });

      // Optimistically remove the case from all case lists
      queryClient.setQueriesData<CasesQueryResult>({ queryKey: ['cases'] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          cases: old.cases.filter((c) => c.id !== id),
          count: Math.max(0, old.count - 1),
        };
      });

      return { previousCasesQueries };
    },
    onError: (error: unknown, _id, context) => {
      // Rollback all case queries on error
      if (context?.previousCasesQueries) {
        context.previousCasesQueries.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete matter.';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage,
      });
    },
    onSuccess: () => {
      // Granular invalidation
      if (organizationId) {
        queryClient.invalidateQueries({
          queryKey: ['cases', organizationId],
          exact: false,
        });
      }
      toast({
        title: 'Success',
        description: 'Matter deleted successfully.',
      });
    },
  });
}
