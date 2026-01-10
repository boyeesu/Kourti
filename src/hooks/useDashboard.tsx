import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { Case, Client, CalendarEvent } from '@/types';

export interface DashboardStats {
  totalCases: number;
  activeCases: number;
  totalClients: number;
  totalDocuments: number;
  totalRevenue: number;
  upcomingEvents: number;
  recentCases: Partial<Case>[];
  recentClients: Partial<Client>[];
  upcomingCalendarEvents: Partial<CalendarEvent>[];
}

/**
 * Hook to fetch dashboard statistics and metrics with error handling
 */
export function useDashboard() {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  return useQuery<DashboardStats>({
    queryKey: ['dashboard-stats', organizationId],
    queryFn: async () => {
      if (!organizationId) {
        return {
          totalCases: 0,
          activeCases: 0,
          totalClients: 0,
          totalDocuments: 0,
          totalRevenue: 0,
          upcomingEvents: 0,
          recentCases: [] as Partial<Case>[],
          recentClients: [] as Partial<Client>[],
          upcomingCalendarEvents: [] as Partial<CalendarEvent>[],
        };
      }

      // No mock data - always fetch from database

      // Calculate date range for upcoming events (now to 7 days from now)
      // Match the calendar page logic: events that start more than 0 days from now and within 7 days
      const now = new Date();
      const endOfWeek = new Date(now);
      endOfWeek.setDate(endOfWeek.getDate() + 7);
      endOfWeek.setHours(23, 59, 59, 999);

      // Fetch all stats in parallel for better performance
      const [
          casesResult,
          activeCasesResult,
          clientsResult,
          documentsResult,
          invoicesResult,
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
            .in('status', ['open', 'active', 'in_progress']),

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
            
          // Get total revenue from invoices
          supabase
            .from('invoices')
            .select('total_amount')
            .eq('organization_id', organizationId)
            .eq('status', 'paid'),

          // Upcoming events count (next 7 days)
          supabase
            .from('calendar_events')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', organizationId)
            .gt('start_date', now.toISOString())
            .lte('start_date', endOfWeek.toISOString()),

          // Recent cases (last 5)
          supabase
            .from('cases')
            .select('id, title, status, created_at, client_id, client:client_id(name)')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false })
            .limit(5),

          // Recent clients (last 5)
          supabase
            .from('clients')
            .select('id, name, email, created_at, company')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false })
            .limit(5),

          // Upcoming calendar events (next 7 days, limit 5)
          supabase
            .from('calendar_events')
            .select('id, title, start_date, end_date, event_type, case_id')
            .eq('organization_id', organizationId)
            .gt('start_date', now.toISOString())
            .lte('start_date', endOfWeek.toISOString())
            .order('start_date', { ascending: true })
            .limit(5)
        ]);

      // Calculate total revenue from paid invoices
      const totalRevenue = invoicesResult.data?.reduce((sum, invoice: { total_amount?: number | null }) => {
        return sum + (invoice?.total_amount || 0);
      }, 0) || 0;

      // Check for errors
      if (casesResult.error || activeCasesResult.error || clientsResult.error || 
          documentsResult.error || upcomingEventsResult.error || 
          upcomingCalendarEventsResult.error || recentCasesResult.error || 
          recentClientsResult.error || invoicesResult.error) {
        // Log specific errors for debugging
        if (upcomingCalendarEventsResult.error) {
          console.error('Calendar events query error:', upcomingCalendarEventsResult.error);
        }
        throw new Error('Failed to load dashboard data. Please try again.');
      }

      // Debug: Log calendar events data
      console.log('Calendar events query result:', {
        data: upcomingCalendarEventsResult.data,
        count: upcomingCalendarEventsResult.data?.length || 0,
        error: upcomingCalendarEventsResult.error,
        dateRange: {
          start: now.toISOString(),
          end: endOfWeek.toISOString()
        },
        organizationId
      });

      const result = {
        totalCases: casesResult.count || 0,
        activeCases: activeCasesResult.count || 0,
        totalClients: clientsResult.count || 0,
        totalDocuments: documentsResult.count || 0,
        totalRevenue: totalRevenue,
        upcomingEvents: upcomingEventsResult.count || 0,
        recentCases: (recentCasesResult.data || []) as Partial<Case>[],
        recentClients: (recentClientsResult.data || []) as Partial<Client>[],
        upcomingCalendarEvents: (upcomingCalendarEventsResult.data || []) as Partial<CalendarEvent>[],
      };

      console.log('Dashboard result - upcomingCalendarEvents count:', result.upcomingCalendarEvents.length, result.upcomingCalendarEvents);

      return result;
    },
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: true,
    retry: 2, // Retry failed requests twice
  });
}

// Keep the existing useDashboardStats function for backward compatibility
export const useDashboardStats = useDashboard;
