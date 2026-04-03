import { useQuery } from '@tanstack/react-query';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { Case, Client, CalendarEvent } from '@/types';
import { invokeNodeApi } from '@/lib/backendApi';

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

      return invokeNodeApi<DashboardStats>('/api/v1/dashboard/stats');
    },
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: true,
    retry: 2, // Retry failed requests twice
  });
}

// Keep the existing useDashboardStats function for backward compatibility
export const useDashboardStats = useDashboard;
