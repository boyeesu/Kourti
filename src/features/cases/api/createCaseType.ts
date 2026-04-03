import { invokeNodeApi } from '@/lib/backendApi';
import { AppError, ErrorCode } from '@/lib/error-handling';
import type { CaseType } from '../types';

/**
 * Input type for creating a new case type
 */
export interface CreateCaseTypeInput {
  /** The name of the case type */
  name: string;

  /** Optional description of the case type */
  description?: string;

  /** Organization ID this case type belongs to */
  organization_id: string;

  /** User ID of who is creating this case type */
  created_by: string;

  /** Whether this case type is active (default: true) */
  is_active?: boolean;
}

/**
 * Creates a new case type via the Node backend
 * @param input - The case type data to create
 * @returns The created case type
 */
export async function createCaseType(input: CreateCaseTypeInput): Promise<CaseType> {
  // Validate required fields
  if (!input.name.trim()) {
    throw new AppError('Case type name is required', ErrorCode.VALIDATION_ERROR);
  }

  if (!input.organization_id) {
    throw new AppError('Organization ID is required', ErrorCode.VALIDATION_ERROR);
  }

  const data = await invokeNodeApi<CaseType>('/api/v1/misc/case-types', {
    method: 'POST',
    body: {
      name: input.name.trim(),
      description: input.description || null,
      organization_id: input.organization_id,
      created_by: input.created_by,
      is_active: input.is_active ?? true,
    },
  });

  return data;
}

/**
 * Hook for creating case types using React Query
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getCurrentUserId } from '@/hooks/useCurrentUser';

export function useCreateCaseType() {
  const queryClient = useQueryClient();

  return useMutation<CaseType, AppError, Omit<CreateCaseTypeInput, 'created_by'>>({
    mutationFn: async (input) => {
      const userId = await getCurrentUserId();
      return createCaseType({
        ...input,
        created_by: userId || '',
      });
    },
    onSuccess: () => {
      // Invalidate case types query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['caseTypes'] });
    },
  });
}
