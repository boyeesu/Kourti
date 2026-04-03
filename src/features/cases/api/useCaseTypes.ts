import { useQuery } from '@tanstack/react-query';
import { invokeNodeApi } from '@/lib/backendApi';
import type { CaseType } from '@/features/cases/types';
import { AppError, tryCatch } from '@/lib/error-handling';

/**
 * Hook to fetch case types from the Node backend
 * @returns Case types query result
 */
export function useCaseTypes() {
  return useQuery<CaseType[], AppError>({
    queryKey: ['caseTypes'],
    queryFn: async () => {
      const [data, error] = await tryCatch(async () => {
        return invokeNodeApi<CaseType[]>('/api/v1/misc/case-types');
      });

      if (error) {
        throw error;
      }

      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch all case types directly (for use outside of React components)
 * @param organizationId - The ID of the organization (optional)
 * @returns A promise that resolves to an array of case types
 */
export async function fetchCaseTypes(organizationId?: string): Promise<CaseType[]> {
  const [data, error] = await tryCatch(async () => {
    return invokeNodeApi<CaseType[]>('/api/v1/misc/case-types', {
      query: organizationId ? { organizationId } : undefined,
    });
  });

  if (error) {
    console.error('Error fetching case types:', error);
    throw error;
  }

  return data || [];
}
