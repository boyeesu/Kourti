import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react-hooks';
import { useClients } from '../src/hooks/useClients';

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

describe('Clients functionality', () => {
  const mockClients = [
    {
      id: 'client-1',
      name: 'John Smith',
      email: 'john.smith@example.com',
      phone: '123-456-7890',
      company: 'Smith Enterprises',
      status: 'active',
      created_at: '2025-08-01T10:00:00',
      updated_at: '2025-08-16T10:00:00'
    },
    {
      id: 'client-2',
      name: 'Jane Doe',
      email: 'jane.doe@example.com',
      phone: '987-654-3210',
      company: 'Doe Industries',
      status: 'active',
      created_at: '2025-08-05T10:00:00',
      updated_at: '2025-08-16T10:00:00'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch clients for an organization', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(callback => {
        callback({ data: mockClients, error: null, count: mockClients.length });
        return { catch: vi.fn() };
      })
    };
    
    vi.mock('@/integrations/supabase/client', () => ({
      supabase: mockSupabase
    }));

    const { result, waitForNextUpdate } = renderHook(() => useClients());
    
    // Assert initial state
    expect(result.current.data).toBe(null);
    
    await waitForNextUpdate();
    
    // Assert final state
    expect(result.current.data).toEqual({
      clients: mockClients,
      count: mockClients.length
    });
    
    expect(mockSupabase.from).toHaveBeenCalledWith('clients');
    expect(mockSupabase.eq).toHaveBeenCalledWith('organization_id', 'org-123');
  });

  it('should fetch a single client by ID', async () => {
    const clientId = 'client-1';
    const mockClient = mockClients.find(c => c.id === clientId);
    
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(callback => {
        callback({ data: mockClient, error: null });
        return { catch: vi.fn() };
      })
    };
    
    vi.mock('@/integrations/supabase/client', () => ({
      supabase: mockSupabase
    }));

    const { result, waitForNextUpdate } = renderHook(() => useClients(clientId));
    
    await waitForNextUpdate();
    
    expect(result.current.data).toEqual(mockClient);
    expect(mockSupabase.from).toHaveBeenCalledWith('clients');
    expect(mockSupabase.eq).toHaveBeenCalledWith('id', clientId);
  });

  it('should create a new client', async () => {
    const newClient = {
      name: 'New Client',
      email: 'new.client@example.com',
      phone: '555-123-4567',
      company: 'New Company',
      status: 'active'
    };
    
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(callback => {
        callback({ data: { ...newClient, id: 'new-client-id' }, error: null });
        return { catch: vi.fn() };
      })
    };
    
    vi.mock('@/integrations/supabase/client', () => ({
      supabase: mockSupabase
    }));

    const { result } = renderHook(() => useClients());
    
    await act(async () => {
      await result.current.createClient(newClient);
    });
    
    expect(mockSupabase.from).toHaveBeenCalledWith('clients');
    expect(mockSupabase.insert).toHaveBeenCalledWith(expect.objectContaining({
      ...newClient,
      organization_id: expect.any(String),
      created_by: expect.any(String)
    }));
  });

  it('should update an existing client', async () => {
    const updateData = {
      id: 'client-1',
      name: 'Updated Client Name',
      email: 'updated.email@example.com'
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

    const { result } = renderHook(() => useClients());
    
    await act(async () => {
      await result.current.updateClient(updateData);
    });
    
    expect(mockSupabase.from).toHaveBeenCalledWith('clients');
    expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({
      name: updateData.name,
      email: updateData.email
    }));
    expect(mockSupabase.eq).toHaveBeenCalledWith('id', updateData.id);
  });

  it('should delete a client', async () => {
    const clientId = 'client-1';
    
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

    const { result } = renderHook(() => useClients());
    
    await act(async () => {
      await result.current.deleteClient(clientId);
    });
    
    expect(mockSupabase.from).toHaveBeenCalledWith('clients');
    expect(mockSupabase.delete).toHaveBeenCalled();
    expect(mockSupabase.eq).toHaveBeenCalledWith('id', clientId);
  });
});