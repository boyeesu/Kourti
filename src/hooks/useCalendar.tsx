import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUserOrganization } from './useUserOrganization';

export interface CalendarEvent {
  id: string;
  organization_id: string;
  case_id?: string;
  client_id?: string;
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  location?: string;
  attendees?: string[];
  event_type: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

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

export function useCalendarEvents() {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  return useQuery({
    queryKey: ['calendar-events', organizationId],
    queryFn: async () => {
      if (!organizationId) {
        console.log('⚠️ No organization ID for calendar events');
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
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000,
  });
}

export function useCalendarEvent(id: string) {
  return useQuery({
    queryKey: ['calendar-event', id],
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

export function useCalendarEventsByDateRange(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['calendar-events', 'range', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .gte('start_date', startDate)
        .lte('end_date', endDate)
        .order('start_date', { ascending: true });

      if (error) throw error;
      return data as CalendarEvent[];
    },
    enabled: !!startDate && !!endDate,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateCalendarEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async (eventData: CreateCalendarEventData) => {
      if (!organizationId) {
        throw new Error('Organization not found');
      }

      const { data, error } = await supabase
        .from('calendar_events')
        .insert({
          ...eventData,
          organization_id: organizationId,
          created_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      toast({
        title: "Success",
        description: "Calendar event created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create calendar event.",
      });
    },
  });
}

export function useUpdateCalendarEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-event', data.id] });
      toast({
        title: "Success",
        description: "Calendar event updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update calendar event.",
      });
    },
  });
}

export function useDeleteCalendarEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      toast({
        title: "Success",
        description: "Calendar event deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete calendar event.",
      });
    },
  });
}