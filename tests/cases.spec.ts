import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react-hooks';
import { useCases, useCase, useCreateCase, useUpdateCase, useDeleteCase } from '../src/hooks/useCases';

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

describe('Cases functionality', () => {
  const mockCases = [
    {
      id: 'case-1',
      title: 'Smith vs Jones',
      status: 'open',
      case_number: 'C-2025-001',
      created_at: '2025-08-01T10:00:00',
      updated_at: '2025-08-16T10:00:00'
    },
    {
      id: 'case-2',
      title: 'Johnson Divorce',
      status: 'in_progress',
      case_number: 'C-2025-002',
      created_at: '2025-08-10T10:00:00',
      updated_at: '2025-08-16T10:00:00'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch cases for an organization', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(callback => {
        callback({ data: mockCases, error: null, count: mockCases.length });
        return { catch: vi.fn() };
      })
    };
    
    vi.mock('@/integrations/supabase/client', () => ({
      supabase: mockSupabase
    }));

    const { result, waitForNextUpdate } = renderHook(() => useCases());
    
    // Assert initial state
    expect(result.current.data).toBe(null);
    
    await waitForNextUpdate();
    
    // Assert final state
    expect(result.current.data).toEqual({
      cases: mockCases,
      count: mockCases.length
    });
  });

  it('should fetch a single case by ID', async () => {
    const caseId = 'case-1';
    const mockCase = mockCases.find(c => c.id === caseId);
    
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(callback => {
        callback({ data: mockCase, error: null });
        return { catch: vi.fn() };
      })
    };
    
    vi.mock('@/integrations/supabase/client', () => ({
      supabase: mockSupabase
    }));

    const { result, waitForNextUpdate } = renderHook(() => useCase(caseId));
    
    await waitForNextUpdate();
    
    expect(result.current.data).toEqual(mockCase);
    expect(mockSupabase.from).toHaveBeenCalledWith('cases');
    expect(mockSupabase.eq).toHaveBeenCalledWith('id', caseId);
  });

  it('should create a new case', async () => {
    const newCase = {
      title: 'New Case',
      description: 'Case description',
      status: 'open',
      priority: 'high'
    };
    
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(callback => {
        callback({ data: { ...newCase, id: 'new-case-id' }, error: null });
        return { catch: vi.fn() };
      })
    };
    
    vi.mock('@/integrations/supabase/client', () => ({
      supabase: mockSupabase
    }));

    const { result } = renderHook(() => useCreateCase());
    
    await act(async () => {
      await result.current.mutate(newCase);
    });
    
    expect(mockSupabase.from).toHaveBeenCalledWith('cases');
    expect(mockSupabase.insert).toHaveBeenCalledWith(expect.objectContaining({
      ...newCase,
      organization_id: expect.any(String),
      created_by: expect.any(String)
    }));
  });

  it('should update an existing case', async () => {
    const updateData = {
      id: 'case-1',
      title: 'Updated Case Title',
      status: 'closed'
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

    const { result } = renderHook(() => useUpdateCase());
    
    await act(async () => {
      await result.current.mutate(updateData);
    });
    
    expect(mockSupabase.from).toHaveBeenCalledWith('cases');
    expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({
      title: updateData.title,
      status: updateData.status
    }));
    expect(mockSupabase.eq).toHaveBeenCalledWith('id', updateData.id);
  });

  it('should delete a case', async () => {
    const caseId = 'case-1';
    
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

    const { result } = renderHook(() => useDeleteCase());
    
    await act(async () => {
      await result.current.mutate(caseId);
    });
    
    expect(mockSupabase.from).toHaveBeenCalledWith('cases');
    expect(mockSupabase.delete).toHaveBeenCalled();
    expect(mockSupabase.eq).toHaveBeenCalledWith('id', caseId);
  });
});