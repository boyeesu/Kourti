import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('get_shared_calendars', { user_uuid: user.id });

      if (error) throw error;
      return (data as SharedCalendar[]) || [];
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('get_calendar_viewers', { user_uuid: user.id });

      if (error) throw error;
      return (data as CalendarViewer[]) || [];
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
      const { data, error } = await supabase
        .from('calendar_shares_with_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as CalendarShare[]) || [];
    },
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Share calendar with another user
 */
export function useShareCalendar() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (shareData: CreateCalendarShareData) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get user's organization
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!profile?.organization_id) {
        throw new Error('Organization not found');
      }

      const { data, error } = await supabase
        .from('calendar_shares')
        .insert({
          calendar_owner_id: user.id,
          shared_with_user_id: shareData.shared_with_user_id,
          organization_id: profile.organization_id,
          permission_level: shareData.permission_level,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        const pgError = error as { code?: string };
        if (pgError.code === '23505') {
          throw new Error('Calendar is already shared with this user');
        }
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-viewers'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-shares'] });
      toast({
        title: 'Success',
        description: 'Calendar shared successfully.',
      });
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Failed to share calendar.';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage,
      });
    },
  });
}

/**
 * Update a calendar share (change permissions or deactivate)
 */
export function useUpdateCalendarShare() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      shareId,
      updates,
    }: {
      shareId: string;
      updates: UpdateCalendarShareData;
    }) => {
      const { data, error } = await supabase
        .from('calendar_shares')
        .update(updates)
        .eq('id', shareId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-viewers'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-shares'] });
      queryClient.invalidateQueries({ queryKey: ['shared-calendars'] });
      toast({
        title: 'Success',
        description: 'Calendar share updated successfully.',
      });
    },
    onError: (error: unknown) => {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update calendar share.';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage,
      });
    },
  });
}

/**
 * Revoke calendar access (soft delete by setting is_active to false)
 */
export function useRevokeCalendarShare() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (shareId: string) => {
      const { data, error } = await supabase
        .from('calendar_shares')
        .update({ is_active: false })
        .eq('id', shareId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-viewers'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-shares'] });
      queryClient.invalidateQueries({ queryKey: ['shared-calendars'] });
      toast({
        title: 'Success',
        description: 'Calendar access revoked.',
      });
    },
    onError: (error: unknown) => {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to revoke calendar access.';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage,
      });
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get user's organization
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!profile?.organization_id) {
        throw new Error('Organization not found');
      }

      // Get organization members excluding current user
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, email, calendar_color')
        .eq('organization_id', profile.organization_id)
        .neq('user_id', user.id);

      if (error) throw error;

      return (
        data.map((member) => ({
          id: member.user_id,
          name: `${member.first_name || ''} ${member.last_name || ''}`.trim() || member.email || '',
          email: member.email || '',
          color: member.calendar_color || '#3b82f6',
        })) || []
      );
    },
    staleTime: 5 * 60 * 1000,
  });
}
