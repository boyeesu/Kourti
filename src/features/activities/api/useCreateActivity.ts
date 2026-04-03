import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeNodeApi } from '@/lib/backendApi';

export interface CreateActivityData {
  title: string;
  description?: string;
  activity_type: string;
  status?: string;
  due_date?: string | null;
  assigned_to?: string | null;
}

export interface UpdateActivityData extends Partial<CreateActivityData> {
  id: string;
}

/**
 * Create a new activity for a given case
 */
export function useCreateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ caseId, payload }: { caseId: string; payload: CreateActivityData }) => {
      const data = await invokeNodeApi<Record<string, unknown>>('/api/v1/misc/case-activities', {
        method: 'POST',
        body: { ...payload, case_id: caseId },
      });
      return data;
    },
    onSuccess: (_, { caseId }) => qc.invalidateQueries({ queryKey: ['activities', caseId] }),
  });
}

/**
 * Update an existing activity
 */
export function useUpdateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updateData }: UpdateActivityData) => {
      const data = await invokeNodeApi<Record<string, unknown>>(
        `/api/v1/misc/case-activities/${id}`,
        {
          method: 'PATCH',
          body: updateData,
        }
      );
      return data;
    },
    onSuccess: (data) => {
      const caseId = (data as Record<string, unknown>)?.case_id;
      if (caseId) {
        qc.invalidateQueries({ queryKey: ['activities', caseId] });
      }
    },
  });
}
