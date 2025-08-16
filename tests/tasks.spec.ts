import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react-hooks';
import { useTasks } from '../src/hooks/useTasks';

// Mock the Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    match: vi.fn().mockReturnThis(),
    data: null,
    error: null
  }
}));

// Mock the toast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn()
  })
}));

// Mock the userOrganization hook
vi.mock('@/hooks/useUserOrganization', () => ({
  useUserOrganization: () => ({
    data: 'org-123',
    isLoading: false,
    error: null
  })
}));

// Mock the getCurrentUserId function
vi.mock('@/hooks/useCurrentUser', () => ({
  getCurrentUserId: vi.fn().mockResolvedValue('user-123')
}));

// Mock QueryClient
vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn().mockImplementation((options) => ({
    data: null,
    isLoading: false,
    error: null,
    queryKey: options.queryKey
  })),
  useMutation: vi.fn().mockImplementation(({ mutationFn, onSuccess, onError }) => ({
    mutate: async (data) => {
      try {
        const result = await mutationFn(data);
        onSuccess && onSuccess(result);
        return result;
      } catch (error) {
        onError && onError(error);
        throw error;
      }
    },
    isLoading: false,
    isError: false,
    error: null
  })),
  useQueryClient: vi.fn().mockReturnValue({
    invalidateQueries: vi.fn()
  })
}));

describe('Tasks functionality', () => {
  const mockTasks = [
    {
      id: 'task-1',
      title: 'Prepare legal brief',
      description: 'Draft legal brief for Smith case',
      priority: 'high',
      due_date: '2025-08-25T17:00:00',
      completed: false,
      case_id: 'case-1',
      assigned_to: 'user-123',
      created_at: '2025-08-15T10:00:00',
      updated_at: '2025-08-16T10:00:00'
    },
    {
      id: 'task-2',
      title: 'Review contract',
      description: 'Review and annotate Johnson contract',
      priority: 'medium',
      due_date: '2025-08-20T17:00:00',
      completed: false,
      case_id: 'case-2',
      assigned_to: 'user-456',
      created_at: '2025-08-14T10:00:00',
      updated_at: '2025-08-16T10:00:00'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch tasks for a user', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(callback => {
        callback({ data: mockTasks, error: null, count: mockTasks.length });
        return { catch: vi.fn() };
      })
    };
    
    vi.mock('@/integrations/supabase/client', () => ({
      supabase: mockSupabase
    }));

    const { result, waitForNextUpdate } = renderHook(() => useTasks());
    
    // Assert initial state
    expect(result.current.data).toBe(null);
    
    await waitForNextUpdate();
    
    // Assert final state
    expect(result.current.data).toEqual({
      tasks: mockTasks,
      count: mockTasks.length
    });
    
    expect(mockSupabase.from).toHaveBeenCalledWith('tasks');
    expect(mockSupabase.eq).toHaveBeenCalledWith('organization_id', 'org-123');
  });

  it('should fetch tasks for a specific case', async () => {
    const caseId = 'case-1';
    const mockCaseTasks = mockTasks.filter(task => task.case_id === caseId);
    
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(callback => {
        callback({ data: mockCaseTasks, error: null });
        return { catch: vi.fn() };
      })
    };
    
    vi.mock('@/integrations/supabase/client', () => ({
      supabase: mockSupabase
    }));

    const { result, waitForNextUpdate } = renderHook(() => useTasks({ caseId }));
    
    await waitForNextUpdate();
    
    expect(result.current.data).toEqual({
      tasks: mockCaseTasks,
      count: mockCaseTasks.length
    });
    
    expect(mockSupabase.from).toHaveBeenCalledWith('tasks');
    expect(mockSupabase.eq).toHaveBeenCalledWith('case_id', caseId);
  });

  it('should create a new task', async () => {
    const newTask = {
      title: 'New Task',
      description: 'Task description',
      priority: 'high',
      due_date: '2025-08-30T17:00:00',
      case_id: 'case-1',
      assigned_to: 'user-123'
    };
    
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(callback => {
        callback({ data: { ...newTask, id: 'new-task-id' }, error: null });
        return { catch: vi.fn() };
      })
    };
    
    vi.mock('@/integrations/supabase/client', () => ({
      supabase: mockSupabase
    }));

    const { result } = renderHook(() => useTasks());
    
    await act(async () => {
      await result.current.createTask(newTask);
    });
    
    expect(mockSupabase.from).toHaveBeenCalledWith('tasks');
    expect(mockSupabase.insert).toHaveBeenCalledWith(expect.objectContaining({
      ...newTask,
      organization_id: 'org-123',
      created_by: 'user-123',
      completed: false
    }));
  });

  it('should update an existing task', async () => {
    const updateData = {
      id: 'task-1',
      title: 'Updated Task Title',
      priority: 'low',
      completed: true
    };
    
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(callback => {
        callback({ data: updateData, error: null });
        return { catch: vi.fn() };
      })
    };
    
    vi.mock('@/integrations/supabase/client', () => ({
      supabase: mockSupabase
    }));

    const { result } = renderHook(() => useTasks());
    
    await act(async () => {
      await result.current.updateTask(updateData);
    });
    
    expect(mockSupabase.from).toHaveBeenCalledWith('tasks');
    expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({
      title: updateData.title,
      priority: updateData.priority,
      completed: updateData.completed
    }));
    expect(mockSupabase.eq).toHaveBeenCalledWith('id', updateData.id);
  });

  it('should delete a task', async () => {
    const taskId = 'task-1';
    
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(callback => {
        callback({ error: null });
        return { catch: vi.fn() };
      })
    };
    
    vi.mock('@/integrations/supabase/client', () => ({
      supabase: mockSupabase
    }));

    const { result } = renderHook(() => useTasks());
    
    await act(async () => {
      await result.current.deleteTask(taskId);
    });
    
    expect(mockSupabase.from).toHaveBeenCalledWith('tasks');
    expect(mockSupabase.delete).toHaveBeenCalled();
    expect(mockSupabase.eq).toHaveBeenCalledWith('id', taskId);
  });

  it('should toggle task completion status', async () => {
    const taskId = 'task-1';
    const isCompleted = true;
    
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(callback => {
        callback({ data: { id: taskId, completed: isCompleted }, error: null });
        return { catch: vi.fn() };
      })
    };
    
    vi.mock('@/integrations/supabase/client', () => ({
      supabase: mockSupabase
    }));

    const { result } = renderHook(() => useTasks());
    
    await act(async () => {
      await result.current.toggleTaskCompletion(taskId, isCompleted);
    });
    
    expect(mockSupabase.from).toHaveBeenCalledWith('tasks');
    expect(mockSupabase.update).toHaveBeenCalledWith({ completed: isCompleted });
    expect(mockSupabase.eq).toHaveBeenCalledWith('id', taskId);
  });
});