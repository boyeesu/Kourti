import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react-hooks';
import { useDocuments } from '../src/hooks/useDocuments';

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

describe('Documents functionality', () => {
  const mockDocuments = [
    {
      id: 'doc-1',
      name: 'Contract Draft.pdf',
      title: 'Contract Draft',
      content: 'This is a contract draft content...',
      summary: 'Draft service agreement',
      file_type: 'pdf',
      file_size: 1024000,
      created_at: '2025-08-01T10:00:00',
      updated_at: '2025-08-16T10:00:00'
    },
    {
      id: 'doc-2',
      name: 'Legal Brief.docx',
      title: 'Legal Brief',
      content: 'This is a legal brief content...',
      summary: 'Legal brief for Smith case',
      file_type: 'docx',
      file_size: 512000,
      created_at: '2025-08-05T10:00:00',
      updated_at: '2025-08-16T10:00:00'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch documents for an organization', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(callback => {
        callback({ data: mockDocuments, error: null, count: mockDocuments.length });
        return { catch: vi.fn() };
      })
    };
    
    vi.mock('@/integrations/supabase/client', () => ({
      supabase: mockSupabase
    }));

    const { result, waitForNextUpdate } = renderHook(() => useDocuments());
    
    // Assert initial state
    expect(result.current.data).toBe(null);
    
    await waitForNextUpdate();
    
    // Assert final state
    expect(result.current.data).toEqual({
      documents: mockDocuments,
      count: mockDocuments.length
    });
    
    expect(mockSupabase.from).toHaveBeenCalledWith('documents');
    expect(mockSupabase.eq).toHaveBeenCalledWith('organization_id', 'org-123');
  });

  it('should fetch a single document by ID', async () => {
    const docId = 'doc-1';
    const mockDocument = mockDocuments.find(d => d.id === docId);
    
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(callback => {
        callback({ data: mockDocument, error: null });
        return { catch: vi.fn() };
      })
    };
    
    vi.mock('@/integrations/supabase/client', () => ({
      supabase: mockSupabase
    }));

    const { result, waitForNextUpdate } = renderHook(() => useDocuments(docId));
    
    await waitForNextUpdate();
    
    expect(result.current.data).toEqual(mockDocument);
    expect(mockSupabase.from).toHaveBeenCalledWith('documents');
    expect(mockSupabase.eq).toHaveBeenCalledWith('id', docId);
  });

  it('should upload a new document', async () => {
    const newDocument = {
      name: 'New Document.pdf',
      title: 'New Document',
      content: 'This is a new document content...',
      summary: 'Summary of new document',
      file_type: 'pdf',
      file_size: 750000
    };
    
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(callback => {
        callback({ data: { ...newDocument, id: 'new-doc-id' }, error: null });
        return { catch: vi.fn() };
      })
    };
    
    vi.mock('@/integrations/supabase/client', () => ({
      supabase: mockSupabase
    }));

    const { result } = renderHook(() => useDocuments());
    
    await act(async () => {
      await result.current.uploadDocument(newDocument);
    });
    
    expect(mockSupabase.from).toHaveBeenCalledWith('documents');
    expect(mockSupabase.insert).toHaveBeenCalledWith(expect.objectContaining({
      ...newDocument,
      organization_id: expect.any(String),
      created_by: expect.any(String)
    }));
  });

  it('should update an existing document', async () => {
    const updateData = {
      id: 'doc-1',
      title: 'Updated Document Title',
      summary: 'Updated summary'
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

    const { result } = renderHook(() => useDocuments());
    
    await act(async () => {
      await result.current.updateDocument(updateData);
    });
    
    expect(mockSupabase.from).toHaveBeenCalledWith('documents');
    expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({
      title: updateData.title,
      summary: updateData.summary
    }));
    expect(mockSupabase.eq).toHaveBeenCalledWith('id', updateData.id);
  });

  it('should delete a document', async () => {
    const docId = 'doc-1';
    
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

    const { result } = renderHook(() => useDocuments());
    
    await act(async () => {
      await result.current.deleteDocument(docId);
    });
    
    expect(mockSupabase.from).toHaveBeenCalledWith('documents');
    expect(mockSupabase.delete).toHaveBeenCalled();
    expect(mockSupabase.eq).toHaveBeenCalledWith('id', docId);
  });
});