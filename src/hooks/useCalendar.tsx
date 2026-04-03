/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { CalendarEvent } from '@/types';
import { logWarn } from '@/lib/logger';
import { invokeNodeApi } from '@/lib/backendApi';

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

// Interface matches calendar_events table schema exactly
export interface CreateCalendarEventData {
  // Required fields
  title: string;
  start_date: string;
  end_date: string;

  // Optional basic fields (from calendar_events table)
  description?: string;
  location?: string;
  attendees?: string[];
  event_type?: string;
  case_id?: string;
  client_id?: string;

  // Recurring event fields (from calendar_events table - added via migration)
  is_recurring?: boolean;
  recurrence_pattern?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval: number;
  };
  recurrence_end_date?: string;

  // Note: reminders are NOT in this interface as they're stored in event_reminders table
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

      return invokeNodeApi<CalendarEvent[]>('/api/v1/calendar/events');
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
      return invokeNodeApi<CalendarEvent>(`/api/v1/calendar/events/${id}`);
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
        logWarn('No organization ID found. Skipping date range calendar events fetch.');
        return [];
      }

      return invokeNodeApi<CalendarEvent[]>('/api/v1/calendar/events', {
        query: { startDate, endDate },
      });
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
      return invokeNodeApi<CalendarEvent[]>('/api/v1/calendar/events', {
        query: { clientId },
      });
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

  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async (eventData: CreateCalendarEventData) => {
      if (!organizationId) {
        throw new Error('Organization not found. Cannot create calendar event.');
      }

      return invokeNodeApi<CalendarEvent>('/api/v1/calendar/events', {
        method: 'POST',
        body: eventData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['calendar-events', { organizationId }],
      });
      toast.success('Success', { description: 'Calendar event created successfully.' });
    },
    onError: (error: any) => {
      toast.error('Error', { description: error.message || 'Failed to create calendar event.' });
    },
  });
}

/**
 * Updates an existing calendar event.
 * Invalidates the specific event and relevant calendar-events queries on success.
 */
export function useUpdateCalendarEvent() {
  const queryClient = useQueryClient();

  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async ({
      id,
      ...updateData
    }: { id: string } & Partial<CreateCalendarEventData>) => {
      return invokeNodeApi<CalendarEvent>(`/api/v1/calendar/events/${id}`, {
        method: 'PATCH',
        body: updateData,
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({
        queryKey: ['calendar-event', { id: data?.id }],
      });
      queryClient.invalidateQueries({
        queryKey: ['calendar-events', { organizationId }],
      });
      toast.success('Success', { description: 'Calendar event updated successfully.' });
    },
    onError: (error: any) => {
      toast.error('Error', { description: error.message || 'Failed to update calendar event.' });
    },
  });
}

/**
 * Deletes a calendar event.
 * Invalidates relevant calendar-events queries on success.
 */
export function useDeleteCalendarEvent() {
  const queryClient = useQueryClient();

  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async (id: string) => {
      await invokeNodeApi(`/api/v1/calendar/events/${id}`, { method: 'DELETE' });
      return;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['calendar-events', { organizationId }],
      });
      toast.success('Success', { description: 'Calendar event deleted successfully.' });
    },
    onError: (error: any) => {
      toast.error('Error', { description: error.message || 'Failed to delete calendar event.' });
    },
  });
}
