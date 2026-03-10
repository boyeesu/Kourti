/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { useUserOrganization } from '@/hooks/useUserOrganization';

export interface CalendarIntegration {
  id: string;
  user_id: string;
  organization_id: string;
  provider: 'google' | 'microsoft';
  external_user_id?: string;
  external_email?: string;
  sync_enabled: boolean;
  sync_direction: 'import' | 'export' | 'bidirectional';
  last_sync_at?: string;
  sync_settings?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface SyncSettings {
  sync_enabled: boolean;
  sync_direction: 'import' | 'export' | 'bidirectional';
}

export function useCalendarSync() {
  const queryClient = useQueryClient();
  const { data: organizationId } = useUserOrganization();

  // Fetch calendar integrations
  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ['calendar-integrations', organizationId],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      if (!userId || !organizationId) return [];

      const { data, error } = await supabase
        .from('user_calendar_integrations' as any)
        .select('*')
        .eq('user_id', userId)
        .eq('organization_id', organizationId);

      if (error) throw error;
      return (data as unknown as CalendarIntegration[]) || [];
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Connect calendar
  const connectCalendar = useMutation({
    mutationFn: async (provider: 'google' | 'microsoft') => {
      const { data, error } = await supabase.functions.invoke(
        provider === 'google' ? 'google-calendar-sync' : 'teams-calendar-sync',
        {
          body: { action: 'connect' },
        }
      );

      if (error) throw error;
      return data?.authorization_url;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-integrations'] });
    },
  });

  // Disconnect calendar
  const disconnectCalendar = useMutation({
    mutationFn: async (provider: 'google' | 'microsoft') => {
      const userId = await getCurrentUserId();
      if (!userId || !organizationId) throw new Error('User or organization not found');

      const integration = integrations.find((i) => i.provider === provider);
      if (!integration) throw new Error('Integration not found');

      const { error } = await supabase
        .from('user_calendar_integrations' as any)
        .delete()
        .eq('id', integration.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-integrations'] });
      toast.success('Disconnected', { description: 'Calendar disconnected successfully' });
    },
  });

  // Update sync settings
  const updateSyncSettings = useMutation({
    mutationFn: async ({
      provider,
      ...settings
    }: {
      provider: 'google' | 'microsoft';
      sync_enabled?: boolean;
      sync_direction?: 'import' | 'export' | 'bidirectional';
    }) => {
      const userId = await getCurrentUserId();
      if (!userId || !organizationId) throw new Error('User or organization not found');

      const integration = integrations.find((i) => i.provider === provider);
      if (!integration) throw new Error('Integration not found');

      const { error } = await supabase
        .from('user_calendar_integrations' as any)
        .update({
          ...settings,
          updated_at: new Date().toISOString(),
        })
        .eq('id', integration.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-integrations'] });
    },
  });

  // Trigger manual sync
  const triggerSync = useMutation({
    mutationFn: async (provider: 'google' | 'microsoft') => {
      const { data, error } = await supabase.functions.invoke(
        provider === 'google' ? 'google-calendar-sync' : 'teams-calendar-sync',
        {
          body: { action: 'sync-import' },
        }
      );

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-integrations'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
    },
  });

  // Check if provider is connected
  const isConnected = (provider: 'google' | 'microsoft') => {
    return integrations.some((i) => i.provider === provider);
  };

  // Get sync settings for a provider
  const syncSettings = (provider: 'google' | 'microsoft'): SyncSettings | null => {
    const integration = integrations.find((i) => i.provider === provider);
    if (!integration) return null;

    return {
      sync_enabled: integration.sync_enabled ?? true,
      sync_direction: integration.sync_direction || 'bidirectional',
    };
  };

  return {
    integrations,
    isLoading,
    connectCalendar,
    disconnectCalendar,
    updateSyncSettings,
    triggerSync,
    isConnected,
    syncSettings,
  };
}
