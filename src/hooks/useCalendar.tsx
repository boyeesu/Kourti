import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { CalendarEvent } from '@/types';

// Assuming CalendarEvent type is defined elsewhere and matches your database schema.
// Example:
// export interface CalendarEvent {
//   id: string;
//   title: string;
//   description?: string;
//   start_date: string;
//   end_date: string;
//   location?: string;
//   attendees?: string[];
//   event_type?: string;
//   case_id?: string;
//   client_id?: string;
//   organization_id: string;
//   created_by: string;
//   created_at: string;
// }

export interface CreateCalendarEventData {
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  location?: string;
  attendees?: string[];
  event_type?: string;
  case_id?: string;
  client_id?: string;
  is_recurring?: boolean;
  recurrence_pattern?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval: number;
  };
  recurrence_end_date?: string;
}

/**
 * Fetches all calendar events for the current user's organization.
 */
export function useCalendarEvents() {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  return useQuery({
    queryKey: ['calendar-events', { organizationId }],
    queryFn: async () => {
      if (!organizationId) {
        return [];
      }

      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('organization_id', organizationId)
        .order('start_date', { ascending: true });

      if (error) {
        throw error;
      }

      return (data as unknown as CalendarEvent[]) || [];
    },
    // The query is only enabled if all necessary dependencies are met.
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Fetches a single calendar event by its ID.
 */
export function useCalendarEvent(id: string) {
  return useQuery({
    queryKey: ['calendar-event', { id }],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('id', id as any)
        .single();

      if (error) throw error;
      return (data as unknown as CalendarEvent) || {};
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetches all calendar events within a specified date range for the current organization.
 */
export function useCalendarEventsByDateRange(startDate: string, endDate: string) {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  return useQuery({
    queryKey: ['calendar-events', 'range', { startDate, endDate, organizationId }],
    queryFn: async () => {
      if (!organizationId) {
        console.warn('⚠️ No organization ID found. Skipping date range calendar events fetch.');
        return [];
      }

      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('organization_id', organizationId)
        .gte('start_date', startDate)
        .lte('end_date', endDate)
        .order('start_date', { ascending: true });

      if (error) throw error;
      return (data as unknown as CalendarEvent[]) || [];
    },
    enabled: !!startDate && !!endDate && !!organizationId && !orgLoading && !orgError,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetches all calendar events within a specified date range for the current organization.
 */
export function useCalendarEventsByClient(clientId: string) {
  return useQuery({
    queryKey: ['calendar-events', 'client', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('client_id', clientId as any)
        .order('start_date', { ascending: true });

      if (error) throw error;
      return (data as unknown as CalendarEvent[]) || [];
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Creates a new calendar event.
 * Invalidates the relevant calendar-events queries on success.
 */
export function useCreateCalendarEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async (eventData: CreateCalendarEventData) => {
      if (!organizationId) {
        throw new Error('Organization not found. Cannot create calendar event.');
      }

      const userId = await getCurrentUserId();
      const insertData: any = {
        ...eventData,
        organization_id: organizationId,
        created_by: userId,
      };

      // Handle recurring events
      if (eventData.is_recurring && eventData.recurrence_pattern) {
        insertData.is_recurring = true;
        insertData.recurrence_pattern = eventData.recurrence_pattern;
        if (eventData.recurrence_end_date) {
          insertData.recurrence_end_date = eventData.recurrence_end_date;
        }
      }

      const { data, error } = await supabase
        .from('calendar_events')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['calendar-events', { organizationId }],
      });
      toast({
        title: 'Success',
        description: 'Calendar event created successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to create calendar event.',
      });
    },
  });
}

/**
 * Updates an existing calendar event.
 * Invalidates the specific event and relevant calendar-events queries on success.
 */
export function useUpdateCalendarEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async ({ id, ...updateData }: { id: string } & Partial<CreateCalendarEventData>) => {
      const { data, error } = await supabase
        .from('calendar_events')
        .update(updateData as any)
        .eq('id', id as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({
        queryKey: ['calendar-event', { id: data?.id }],
      });
      queryClient.invalidateQueries({
        queryKey: ['calendar-events', { organizationId }],
      });
      toast({
        title: 'Success',
        description: 'Calendar event updated successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to update calendar event.',
      });
    },
  });
}

/**
 * Deletes a calendar event.
 * Invalidates relevant calendar-events queries on success.
 */
export function useDeleteCalendarEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', id as any);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['calendar-events', { organizationId }],
      });
      toast({
        title: 'Success',
        description: 'Calendar event deleted successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to delete calendar event.',
      });
    },
  });
}
