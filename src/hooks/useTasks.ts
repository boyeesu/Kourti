import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Task } from '@/types';
import { useNotificationTriggers } from '@/hooks/useNotificationTriggers';
import { invokeNodeApi } from '@/lib/backendApi';

// Task row type matching the tasks table schema
interface TaskRow {
  id: string;
  case_id: string;
  title: string;
  description?: string;
  due_date?: string;
  priority?: 'high' | 'medium' | 'low';
  assigned_to?: string;
  task_type?: string;
  completed?: boolean;
  organization_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CreateTaskData {
  case_id: string;
  title: string;
  description?: string;
  due_date?: string;
  priority?: 'high' | 'medium' | 'low';
  assigned_to?: string;
  task_type?: string;
}

export interface UpdateTaskData extends Partial<CreateTaskData> {
  id: string;
  completed?: boolean;
}

/**
 * Hook to fetch tasks for a specific case
 * @param caseId - The ID of the case to fetch tasks for
 */
export function useTasks(caseId: string) {
  return useQuery<Task[], Error>({
    queryKey: ['tasks', caseId],
    queryFn: async () => {
      const data = await invokeNodeApi<Task[]>('/api/v1/tasks', {
        query: { caseId },
      });

      return data.map((task) => ({
        ...task,
        organization_id: task.organization_id || '',
      })) as Task[];
    },
    enabled: !!caseId,
    staleTime: 60 * 1000,
  });
}

/**
 * Hook to create a new task
 */
export function useCreateTask() {
  const queryClient = useQueryClient();

  const { createTaskNotification } = useNotificationTriggers();

  return useMutation<TaskRow, Error, CreateTaskData>({
    mutationFn: async (data: CreateTaskData) => {
      return invokeNodeApi<TaskRow>('/api/v1/tasks', {
        method: 'POST',
        body: data,
      });
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.case_id] });
      toast.success('Task created', { description: 'Task successfully added.' });

      // Notify (tracking is handled inside createTaskNotification)
      createTaskNotification(result, 'created', variables.assigned_to);
    },
    onError: (error: Error) => {
      toast.error('Task creation failed', {
        description: error.message || 'Failed to create task.',
      });
    },
  });
}

/**
 * Hook to update an existing task
 */
export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation<TaskRow, Error, UpdateTaskData>({
    mutationFn: async ({ id, ...data }: UpdateTaskData) => {
      return invokeNodeApi<TaskRow>(`/api/v1/tasks/${id}`, {
        method: 'PATCH',
        body: data,
      });
    },
    onSuccess: (updated) => {
      // Type-safe access to updated data
      if (updated.case_id) {
        queryClient.invalidateQueries({ queryKey: ['tasks', updated.case_id] });
      }
      toast.success('Task updated', { description: 'Task changes saved.' });
    },
    onError: (error: Error) => {
      toast.error('Update failed', { description: error.message || 'Failed to update task.' });
    },
  });
}

/**
 * Hook to delete a task
 */
export function useDeleteTask() {
  const queryClient = useQueryClient();

  interface DeleteParams {
    id: string;
    case_id: string;
  }

  return useMutation<DeleteParams, Error, DeleteParams>({
    mutationFn: async ({ id, case_id }: DeleteParams) => {
      await invokeNodeApi<void>(`/api/v1/tasks/${id}`, {
        method: 'DELETE',
      });
      return { id, case_id };
    },
    onSuccess: ({ case_id }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', case_id] });
      toast.success('Task deleted', { description: 'Task removed.' });
    },
    onError: (error: Error) => {
      toast.error('Delete failed', { description: error.message || 'Failed to delete task.' });
    },
  });
}
