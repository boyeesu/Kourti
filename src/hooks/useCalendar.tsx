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
        console.warn('⚠️ No organization ID found. Skipping calendar events fetch.');
        return [];
      }

      console.log('🔍 Fetching calendar events for org:', organizationId);

      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('organization_id', organizationId)
        .order('start_date', { ascending: true });

      if (error) {
        console.error('❌ Error fetching calendar events:', error);
        throw error;
      }

      console.log('✅ Calendar events found:', data?.length || 0);
      return data as CalendarEvent[];
    },
    // The query is only enabled if all necessary dependencies are met.
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 2 * 60 * 1000, // 2 minutes
    cacheTime: 5 * 60 * 1000, // 5 minutes
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
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as CalendarEvent;
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
      return data as CalendarEvent[];
    },
    enabled: !!startDate && !!endDate && !!organizationId && !orgLoading && !orgError,
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
      const { data, error } = await supabase
        .from('calendar_events')
        .insert({
          ...eventData,
          organization_id: organizationId,
          created_by: userId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Invalidate all queries that start with 'calendar-events' and include the organizationId.
      // This is a more precise approach than invalidating all 'calendar-events' queries.
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
  const { data: organizationId } = useUserOrganization(); // Get organizationId here to use in invalidation

  return useMutation({
    mutationFn: async ({ id, ...updateData }: { id: string } & Partial<CreateCalendarEventData>) => {
      const { data, error } = await supabase
        .from('calendar_events')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Invalidate the specific event query first.
      queryClient.invalidateQueries({
        queryKey: ['calendar-event', { id: data.id }],
      });
      // Then, invalidate the more general list query, scoped by organizationId.
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
  const { data: organizationId } = useUserOrganization(); // Get organizationId here to use in invalidation

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate all queries that start with 'calendar-events' and include the organizationId.
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
