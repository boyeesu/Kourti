import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invokeNodeApi } from '@/lib/backendApi';
import {
  CalendarShare,
  SharedCalendar,
  CalendarViewer,
  CreateCalendarShareData,
  UpdateCalendarShareData,
} from '@/types/calendar-sharing';

/**
 * Fetch calendars shared with the current user
 */
export function useSharedCalendars() {
  return useQuery({
    queryKey: ['shared-calendars'],
    queryFn: async () => {
      return invokeNodeApi<SharedCalendar[]>('/api/v1/calendar/shares/shared-with-me');
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Fetch users who have access to the current user's calendar
 */
export function useCalendarViewers() {
  return useQuery({
    queryKey: ['calendar-viewers'],
    queryFn: async () => {
      return invokeNodeApi<CalendarViewer[]>('/api/v1/calendar/shares/viewers');
    },
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Fetch all calendar shares for the current organization
 */
export function useOrganizationCalendarShares() {
  return useQuery({
    queryKey: ['calendar-shares', 'organization'],
    queryFn: async () => {
      return invokeNodeApi<CalendarShare[]>('/api/v1/calendar/shares/viewers');
    },
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Share calendar with another user
 */
export function useShareCalendar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (shareData: CreateCalendarShareData) => {
      return invokeNodeApi('/api/v1/calendar/shares', {
        method: 'POST',
        body: shareData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-viewers'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-shares'] });
      toast.success('Success', { description: 'Calendar shared successfully.' });
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Failed to share calendar.';
      toast.error('Error', { description: errorMessage });
    },
  });
}

/**
 * Update a calendar share (change permissions or deactivate)
 */
export function useUpdateCalendarShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      shareId,
      updates,
    }: {
      shareId: string;
      updates: UpdateCalendarShareData;
    }) => {
      return invokeNodeApi(`/api/v1/calendar/shares/${shareId}`, {
        method: 'PATCH',
        body: updates,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-viewers'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-shares'] });
      queryClient.invalidateQueries({ queryKey: ['shared-calendars'] });
      toast.success('Success', { description: 'Calendar share updated successfully.' });
    },
    onError: (error: unknown) => {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update calendar share.';
      toast.error('Error', { description: errorMessage });
    },
  });
}

/**
 * Revoke calendar access (soft delete by setting is_active to false)
 */
export function useRevokeCalendarShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (shareId: string) => {
      return invokeNodeApi(`/api/v1/calendar/shares/${shareId}`, {
        method: 'PATCH',
        body: { is_active: false },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-viewers'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-shares'] });
      queryClient.invalidateQueries({ queryKey: ['shared-calendars'] });
      toast.success('Success', { description: 'Calendar access revoked.' });
    },
    onError: (error: unknown) => {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to revoke calendar access.';
      toast.error('Error', { description: errorMessage });
    },
  });
}

/**
 * Get organization members for sharing
 */
export function useOrganizationMembersForSharing() {
  return useQuery({
    queryKey: ['organization-members', 'for-sharing'],
    queryFn: async () => {
      return invokeNodeApi<Array<{ id: string; name: string; email: string; color: string }>>(
        '/api/v1/calendar/shares/members'
      );
    },
    staleTime: 5 * 60 * 1000,
  });
}
