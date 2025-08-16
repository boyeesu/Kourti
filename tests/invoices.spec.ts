import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react-hooks';
import { useInvoices } from '../src/hooks/useInvoices';

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

describe('Invoices functionality', () => {
  const mockInvoices = [
    {
      id: 'inv-1',
      title: 'Legal Services - August 2025',
      invoice_number: 'INV-2025-001',
      client_id: 'client-1',
      status: 'pending',
      issue_date: '2025-08-01T00:00:00',
      due_date: '2025-08-31T23:59:59',
      subtotal: 5000,
      tax_rate: 7.5,
      tax_amount: 375,
      total_amount: 5375,
      currency: 'USD',
      created_at: '2025-08-01T10:00:00',
      updated_at: '2025-08-01T10:00:00'
    },
    {
      id: 'inv-2',
      title: 'Consultation Services - July 2025',
      invoice_number: 'INV-2025-002',
      client_id: 'client-2',
      status: 'paid',
      issue_date: '2025-07-01T00:00:00',
      due_date: '2025-07-31T23:59:59',
      subtotal: 3000,
      tax_rate: 7.5,
      tax_amount: 225,
      total_amount: 3225,
      currency: 'USD',
      created_at: '2025-07-01T10:00:00',
      updated_at: '2025-07-15T10:00:00'
    }
  ];

  const mockInvoiceItems = [
    {
      id: 'item-1',
      invoice_id: 'inv-1',
      description: 'Legal consultation',
      rate: 250,
      quantity: 10,
      amount: 2500,
      created_at: '2025-08-01T10:00:00',
      updated_at: '2025-08-01T10:00:00'
    },
    {
      id: 'item-2',
      invoice_id: 'inv-1',
      description: 'Contract drafting',
      rate: 500,
      quantity: 5,
      amount: 2500,
      created_at: '2025-08-01T10:00:00',
      updated_at: '2025-08-01T10:00:00'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch invoices for an organization', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(callback => {
        callback({ data: mockInvoices, error: null, count: mockInvoices.length });
        return { catch: vi.fn() };
      })
    };
    
    vi.mock('@/integrations/supabase/client', () => ({
      supabase: mockSupabase
    }));

    const { result, waitForNextUpdate } = renderHook(() => useInvoices());
    
    // Assert initial state
    expect(result.current.data).toBe(null);
    
    await waitForNextUpdate();
    
    // Assert final state
    expect(result.current.data).toEqual({
      invoices: mockInvoices,
      count: mockInvoices.length
    });
    
    expect(mockSupabase.from).toHaveBeenCalledWith('invoices');
    expect(mockSupabase.eq).toHaveBeenCalledWith('organization_id', 'org-123');
  });

  it('should fetch a single invoice by ID with its items', async () => {
    const invoiceId = 'inv-1';
    const mockInvoice = mockInvoices.find(inv => inv.id === invoiceId);
    
    const mockSupabaseInvoice = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(callback => {
        callback({ data: mockInvoice, error: null });
        return { catch: vi.fn() };
      })
    };
    
    const mockSupabaseItems = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(callback => {
        callback({ data: mockInvoiceItems, error: null });
        return { catch: vi.fn() };
      })
    };
    
    vi.mock('@/integrations/supabase/client', () => ({
      supabase: (path) => path === 'invoices' ? mockSupabaseInvoice : mockSupabaseItems
    }));

    const { result, waitForNextUpdate } = renderHook(() => useInvoices(invoiceId));
    
    await waitForNextUpdate();
    
    expect(result.current.data).toEqual({
      ...mockInvoice,
      items: mockInvoiceItems
    });
    
    expect(mockSupabaseInvoice.from).toHaveBeenCalledWith('invoices');
    expect(mockSupabaseInvoice.eq).toHaveBeenCalledWith('id', invoiceId);
    expect(mockSupabaseItems.from).toHaveBeenCalledWith('invoice_items');
    expect(mockSupabaseItems.eq).toHaveBeenCalledWith('invoice_id', invoiceId);
  });

  it('should create a new invoice with items', async () => {
    const newInvoice = {
      title: 'New Invoice',
      client_id: 'client-3',
      issue_date: '2025-08-16T00:00:00',
      due_date: '2025-09-15T23:59:59',
      subtotal: 4000,
      tax_rate: 7.5,
      tax_amount: 300,
      total_amount: 4300,
      currency: 'USD',
      items: [
        {
          description: 'Legal research',
          rate: 200,
          quantity: 10,
          amount: 2000
        },
        {
          description: 'Court appearance',
          rate: 2000,
          quantity: 1,
          amount: 2000
        }
      ]
    };
    
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(callback => {
        callback({ data: { ...newInvoice, id: 'new-inv-id', invoice_number: 'INV-2025-003' }, error: null });
        return { catch: vi.fn() };
      })
    };
    
    vi.mock('@/integrations/supabase/client', () => ({
      supabase: mockSupabase
    }));

    const { result } = renderHook(() => useInvoices());
    
    await act(async () => {
      await result.current.createInvoice(newInvoice);
    });
    
    expect(mockSupabase.from).toHaveBeenCalledWith('invoices');
    expect(mockSupabase.insert).toHaveBeenCalledWith(expect.objectContaining({
      title: newInvoice.title,
      client_id: newInvoice.client_id,
      organization_id: 'org-123',
      created_by: 'user-123'
    }));
  });

  it('should update an existing invoice', async () => {
    const updateData = {
      id: 'inv-1',
      title: 'Updated Invoice Title',
      status: 'paid',
      due_date: '2025-09-15T23:59:59'
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

    const { result } = renderHook(() => useInvoices());
    
    await act(async () => {
      await result.current.updateInvoice(updateData);
    });
    
    expect(mockSupabase.from).toHaveBeenCalledWith('invoices');
    expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({
      title: updateData.title,
      status: updateData.status,
      due_date: updateData.due_date
    }));
    expect(mockSupabase.eq).toHaveBeenCalledWith('id', updateData.id);
  });

  it('should delete an invoice', async () => {
    const invoiceId = 'inv-1';
    
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

    const { result } = renderHook(() => useInvoices());
    
    await act(async () => {
      await result.current.deleteInvoice(invoiceId);
    });
    
    expect(mockSupabase.from).toHaveBeenCalledWith('invoices');
    expect(mockSupabase.delete).toHaveBeenCalled();
    expect(mockSupabase.eq).toHaveBeenCalledWith('id', invoiceId);
  });
});