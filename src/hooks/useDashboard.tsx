import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserOrganization } from './useUserOrganization';

export interface DashboardStats {
  totalCases: number;
  activeCases: number;
  totalClients: number;
  totalDocuments: number;
  upcomingEvents: number;
  recentCases: any[];
  recentClients: any[];
  upcomingCalendarEvents: any[];
}

export function useDashboardStats() {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  return useQuery({
    queryKey: ['dashboard-stats', organizationId],
    queryFn: async () => {
      if (!organizationId) {
        console.log('⚠️ No organization ID for dashboard stats');
        return {
          totalCases: 0,
          activeCases: 0,
          totalClients: 0,
          totalDocuments: 0,
          upcomingEvents: 0,
          recentCases: [],
          recentClients: [],
          upcomingCalendarEvents: [],
        };
      }

      console.log('🔍 Fetching dashboard stats for org:', organizationId);

      // Fetch all stats in parallel
      const [
        casesResult,
        activeCasesResult,
        clientsResult,
        documentsResult,
        upcomingEventsResult,
        recentCasesResult,
        recentClientsResult,
        upcomingCalendarEventsResult
      ] = await Promise.all([
        // Total cases count
        supabase
          .from('cases')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', organizationId),

        // Active cases count
        supabase
          .from('cases')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .eq('status', 'open'),

        // Total clients count
        supabase
          .from('clients')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', organizationId),

        // Total documents count
        supabase
          .from('documents')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', organizationId),

        // Upcoming events count (next 7 days)
        supabase
          .from('calendar_events')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .gte('start_date', new Date().toISOString())
          .lte('start_date', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()),

        // Recent cases (last 5)
        supabase
          .from('cases')
          .select('id, title, status, created_at')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(5),

        // Recent clients (last 5)
        supabase
          .from('clients')
          .select('id, name, email, created_at')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(5),

        // Upcoming calendar events (next 5)
        supabase
          .from('calendar_events')
          .select('id, title, start_date, end_date, event_type')
          .eq('organization_id', organizationId)
          .gte('start_date', new Date().toISOString())
          .order('start_date', { ascending: true })
          .limit(5)
      ]);

      console.log('📊 Dashboard stats results:', {
        totalCases: casesResult.count,
        activeCases: activeCasesResult.count,
        totalClients: clientsResult.count,
        totalDocuments: documentsResult.count,
        upcomingEvents: upcomingEventsResult.count,
        recentCases: recentCasesResult.data?.length,
        recentClients: recentClientsResult.data?.length,
        upcomingCalendarEvents: upcomingCalendarEventsResult.data?.length,
      });

      return {
        totalCases: casesResult.count || 0,
        activeCases: activeCasesResult.count || 0,
        totalClients: clientsResult.count || 0,
        totalDocuments: documentsResult.count || 0,
        upcomingEvents: upcomingEventsResult.count || 0,
        recentCases: recentCasesResult.data || [],
        recentClients: recentClientsResult.data || [],
        upcomingCalendarEvents: upcomingCalendarEventsResult.data || [],
      };
    },
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 30 * 1000, // 30 seconds for real-time feel
    gcTime: 2 * 60 * 1000, // 2 minutes
  });
}