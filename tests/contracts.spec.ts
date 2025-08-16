import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react-hooks';
import { useContracts } from '../src/hooks/useContracts';

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

describe('Contracts functionality', () => {
  const mockContracts = [
    {
      id: 'contract-1',
      title: 'Service Agreement - Smith',
      description: 'Legal services agreement',
      status: 'active',
      client_id: 'client-1',
      start_date: '2025-01-01T00:00:00',
      end_date: '2025-12-31T23:59:59',
      value: 5000,
      currency: 'USD',
      created_at: '2025-01-01T10:00:00',
      updated_at: '2025-08-16T10:00:00'
    },
    {
      id: 'contract-2',
      title: 'Consultation Agreement - Doe',
      description: 'Legal consultation services',
      status: 'active',
      client_id: 'client-2',
      start_date: '2025-01-15T00:00:00',
      end_date: '2025-07-15T23:59:59',
      value: 3000,
      currency: 'USD',
      created_at: '2025-01-15T10:00:00',
      updated_at: '2025-08-16T10:00:00'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch contracts for an organization', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(callback => {
        callback({ data: mockContracts, error: null, count: mockContracts.length });
        return { catch: vi.fn() };
      })
    };
    
    vi.mock('@/integrations/supabase/client', () => ({
      supabase: mockSupabase
    }));

    const { result, waitForNextUpdate } = renderHook(() => useContracts());
    
    // Assert initial state
    expect(result.current.data).toBe(null);
    
    await waitForNextUpdate();
    
    // Assert final state
    expect(result.current.data).toEqual(mockContracts);
    
    expect(mockSupabase.from).toHaveBeenCalledWith('contracts');
    expect(mockSupabase.eq).toHaveBeenCalledWith('organization_id', 'org-123');
  });

  it('should fetch a single contract by ID', async () => {
    const contractId = 'contract-1';
    const mockContract = mockContracts.find(c => c.id === contractId);
    
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(callback => {
        callback({ data: mockContract, error: null });
        return { catch: vi.fn() };
      })
    };
    
    vi.mock('@/integrations/supabase/client', () => ({
      supabase: mockSupabase
    }));

    const { result, waitForNextUpdate } = renderHook(() => useContracts(contractId));
    
    await waitForNextUpdate();
    
    expect(result.current.data).toEqual(mockContract);
    expect(mockSupabase.from).toHaveBeenCalledWith('contracts');
    expect(mockSupabase.eq).toHaveBeenCalledWith('id', contractId);
  });

  it('should create a new contract', async () => {
    const newContract = {
      title: 'New Contract',
      description: 'Contract description',
      status: 'draft',
      client_id: 'client-3',
      start_date: '2025-09-01T00:00:00',
      end_date: '2026-08-31T23:59:59',
      value: 7500,
      currency: 'USD'
    };
    
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(callback => {
        callback({ data: { ...newContract, id: 'new-contract-id' }, error: null });
        return { catch: vi.fn() };
      })
    };
    
    vi.mock('@/integrations/supabase/client', () => ({
      supabase: mockSupabase
    }));

    const { result } = renderHook(() => useContracts());
    
    await act(async () => {
      await result.current.createContract(newContract);
    });
    
    expect(mockSupabase.from).toHaveBeenCalledWith('contracts');
    expect(mockSupabase.insert).toHaveBeenCalledWith(expect.objectContaining({
      ...newContract,
      organization_id: expect.any(String),
      created_by: expect.any(String)
    }));
  });

  it('should update an existing contract', async () => {
    const updateData = {
      id: 'contract-1',
      title: 'Updated Contract Title',
      status: 'expired',
      value: 6000
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

    const { result } = renderHook(() => useContracts());
    
    await act(async () => {
      await result.current.updateContract(updateData);
    });
    
    expect(mockSupabase.from).toHaveBeenCalledWith('contracts');
    expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({
      title: updateData.title,
      status: updateData.status,
      value: updateData.value
    }));
    expect(mockSupabase.eq).toHaveBeenCalledWith('id', updateData.id);
  });

  it('should delete a contract', async () => {
    const contractId = 'contract-1';
    
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

    const { result } = renderHook(() => useContracts());
    
    await act(async () => {
      await result.current.deleteContract(contractId);
    });
    
    expect(mockSupabase.from).toHaveBeenCalledWith('contracts');
    expect(mockSupabase.delete).toHaveBeenCalled();
    expect(mockSupabase.eq).toHaveBeenCalledWith('id', contractId);
  });
});