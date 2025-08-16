import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react-hooks';
import { useCalendar } from '../src/hooks/useCalendar';

// Mock Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    match: vi.fn().mockReturnThis(),
    data: null,
    error: null
  }
}));

describe('Calendar functionality', () => {
  const mockEvents = [
    {
      id: '1',
      title: 'Client Meeting',
      start_date: '2025-08-20T10:00:00',
      end_date: '2025-08-20T11:00:00',
      event_type: 'meeting',
      created_at: '2025-08-16T08:00:00',
      updated_at: '2025-08-16T08:00:00'
    },
    {
      id: '2',
      title: 'Court Hearing',
      start_date: '2025-08-21T09:00:00',
      end_date: '2025-08-21T10:30:00',
      event_type: 'hearing',
      created_at: '2025-08-16T08:00:00',
      updated_at: '2025-08-16T08:00:00'
    }
  ];

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
  });

  it('should fetch calendar events successfully', async () => {
    // Mock successful response
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(callback => {
        callback({ data: mockEvents, error: null });
        return { catch: vi.fn() };
      })
    };
    
    // Mock implementation for this specific test
    vi.mock('@/integrations/supabase/client', () => ({
      supabase: mockSupabase
    }));

    // Test the hook behavior
    const { result, waitForNextUpdate } = renderHook(() => useCalendar());
    
    // Assert initial state
    expect(result.current.events).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    
    // Wait for the hook to update
    await waitForNextUpdate();
    
    // Assert updated state
    expect(result.current.events).toEqual(mockEvents);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it('should handle errors when fetching calendar events', async () => {
    const mockError = new Error('Failed to fetch calendar events');
    
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(callback => {
        callback({ data: null, error: mockError });
        return { catch: vi.fn() };
      })
    };
    
    vi.mock('@/integrations/supabase/client', () => ({
      supabase: mockSupabase
    }));

    const { result, waitForNextUpdate } = renderHook(() => useCalendar());
    
    expect(result.current.isLoading).toBe(true);
    
    await waitForNextUpdate();
    
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(mockError);
    expect(result.current.events).toEqual([]);
  });

  it('should create a new calendar event', async () => {
    const newEvent = {
      title: 'New Meeting',
      start_date: '2025-08-22T14:00:00',
      end_date: '2025-08-22T15:00:00',
      event_type: 'meeting'
    };
    
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(callback => {
        callback({ data: { ...newEvent, id: '3' }, error: null });
        return { catch: vi.fn() };
      })
    };
    
    vi.mock('@/integrations/supabase/client', () => ({
      supabase: mockSupabase
    }));

    const { result, waitForNextUpdate } = renderHook(() => useCalendar());
    
    act(() => {
      result.current.createEvent(newEvent);
    });
    
    await waitForNextUpdate();
    
    expect(mockSupabase.from).toHaveBeenCalledWith('calendar_events');
    expect(mockSupabase.insert).toHaveBeenCalledWith(expect.objectContaining(newEvent));
  });
});