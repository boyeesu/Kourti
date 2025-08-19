import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { Task } from '@/types';

export interface CreateTaskData {
  case_id: string;
  title: string;
  description?: string;
  due_date?: string;
  priority?: 'high' | 'medium' | 'low';
  assigned_to?: string;
}

export interface UpdateTaskData extends Partial<CreateTaskData> {
  id: string;
}

export function useTasks(caseId: string) {
  return useQuery({
    queryKey: ['tasks', caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('case_id', caseId)
        .order('due_date', { ascending: true });
      if (error) throw error;
      
      // Transform data to include organization_id (tasks table doesn't have this field)
      return (data || []).map(task => ({
        ...task,
        organization_id: '', // Add default value since tasks table doesn't have this field
      })) as Task[];
    },
    enabled: !!caseId,
    staleTime: 60 * 1000,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: CreateTaskData) => {
      const userId = await getCurrentUserId();
      const { data: created, error } = await supabase
        .from('tasks')
        .insert({ ...data, created_by: userId })
        .select()
        .single();
      if (error) throw error;
      return created;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.case_id] });
      toast({ title: 'Task created', description: 'Task successfully added.' });
    },
    onError: (error: any) => {
      toast({ title: 'Task creation failed', description: error.message || 'Unknown error.', variant: 'destructive' });
    }
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, ...data }: UpdateTaskData) => {
      const { data: updated, error } = await supabase
        .from('tasks')
        .update({ ...data })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return updated;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', updated.case_id] });
      toast({ title: 'Task updated', description: 'Task changes saved.' });
    },
    onError: (error: any) => {
      toast({ title: 'Update failed', description: error.message || 'Unknown error', variant: 'destructive' });
    }
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, case_id }: { id: string, case_id: string }) => {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return { id, case_id };
    },
    onSuccess: ({ case_id }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', case_id] });
      toast({ title: 'Task deleted', description: 'Task removed.' });
    },
    onError: (error: any) => {
      toast({ title: 'Delete failed', description: error.message || 'Unknown error', variant: 'destructive' });
    }
  });
}
