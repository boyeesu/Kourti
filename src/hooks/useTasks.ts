import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { Task } from '@/types';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { AppError, tryCatch } from '@/lib/error-handling';
import { trackEvent, AnalyticsEvents } from '@/lib/analytics';
import { useNotificationTriggers } from '@/hooks/useNotificationTriggers';

// Use Database type for type safety with Supabase
type TaskRow = Tables<'tasks'>;

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
  return useQuery<Task[], AppError>({
    queryKey: ['tasks', caseId],
    queryFn: async () => {
      const [data, error] = await tryCatch(async () => {
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .eq('case_id', caseId)
          .order('due_date', { ascending: true });
        
        if (error) throw error;
        return data || [];
      });
      
      if (error) throw error;
      
      // Transform data to include organization_id (tasks table doesn't have this field)
      return data!.map((task: TaskRow) => ({
        ...task,
        organization_id: '', // Add default value since tasks table doesn't have this field
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
  const { toast } = useToast();
  const { createTaskNotification } = useNotificationTriggers();
  
  return useMutation<TaskRow, AppError, CreateTaskData>({
    mutationFn: async (data: CreateTaskData) => {
      const userId = await getCurrentUserId();
      
      // Create properly typed task data
      const taskData: TablesInsert<'tasks'> = {
        ...data, 
        created_by: userId,
        completed: false,
        updated_at: new Date().toISOString()
      };
      
      const [result, error] = await tryCatch(async () => {
        const { data, error } = await supabase
          .from('tasks')
          .insert(taskData)
          .select()
          .single();
          
        if (error) throw error;
        return data;
      });
      
      if (error) throw error;
      return result!;
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.case_id] });
      toast({ title: 'Task created', description: 'Task successfully added.' });
      
      // Track and notify
      trackEvent(AnalyticsEvents.TASK_CREATED, { priority: variables.priority });
      createTaskNotification(result, 'created', variables.assigned_to);
    },
    onError: (error: AppError) => {
      toast({ 
        title: 'Task creation failed', 
        description: error.getUserMessage(), 
        variant: 'destructive' 
      });
    }
  });
}

/**
 * Hook to update an existing task
 */
export function useUpdateTask() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation<TaskRow, AppError, UpdateTaskData>({
    mutationFn: async ({ id, ...data }: UpdateTaskData) => {
      // Create properly typed update data
      const updateData: Partial<TablesInsert<'tasks'>> = {
        ...data,
        updated_at: new Date().toISOString()
      };
      
      const [result, error] = await tryCatch(async () => {
        const { data, error } = await supabase
          .from('tasks')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();
          
        if (error) throw error;
        return data;
      });
      
      if (error) throw error;
      return result!;
    },
    onSuccess: (updated) => {
      // Type-safe access to updated data
      if (updated.case_id) {
        queryClient.invalidateQueries({ queryKey: ['tasks', updated.case_id] });
      }
      toast({ title: 'Task updated', description: 'Task changes saved.' });
    },
    onError: (error: AppError) => {
      toast({ 
        title: 'Update failed', 
        description: error.getUserMessage(), 
        variant: 'destructive' 
      });
    }
  });
}

/**
 * Hook to delete a task
 */
export function useDeleteTask() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  interface DeleteParams {
    id: string;
    case_id: string;
  }
  
  return useMutation<DeleteParams, AppError, DeleteParams>({
    mutationFn: async ({ id, case_id }: DeleteParams) => {
      const [, error] = await tryCatch(async () => {
        const { error } = await supabase
          .from('tasks')
          .delete()
          .eq('id', id);
          
        if (error) throw error;
        return true;
      });
      
      if (error) throw error;
      return { id, case_id };
    },
    onSuccess: ({ case_id }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', case_id] });
      toast({ title: 'Task deleted', description: 'Task removed.' });
    },
    onError: (error: AppError) => {
      toast({ 
        title: 'Delete failed', 
        description: error.getUserMessage(), 
        variant: 'destructive' 
      });
    }
  });
}
