import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";

export interface Activity {
  id: string;
  activity_type: string | null;
  title: string;
  description: string | null;
  status: string | null;
  case_id: string;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string | null;
  due_date: string | null;
  organization_id: string;
}

/**
 * Hook to fetch all activities for analytics and dashboard
 */
export function useAllActivities() {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  return useQuery<Activity[], Error>({
    queryKey: ["all-activities", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      const { data, error } = await supabase
        .from("case_activities")
        .select(
          `
          id,
          activity_type,
          title,
          description,
          status,
          case_id,
          assigned_to,
          created_by,
          created_at,
          due_date,
          organization_id
        `
        )
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as Activity[];
    },
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch recent activities (last N days)
 */
export function useRecentActivities(days: number = 30) {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return useQuery<Activity[], Error>({
    queryKey: ["recent-activities", organizationId, days],
    queryFn: async () => {
      if (!organizationId) return [];

      const { data, error } = await supabase
        .from("case_activities")
        .select(
          `
          id,
          activity_type,
          title,
          description,
          status,
          case_id,
          assigned_to,
          created_by,
          created_at,
          due_date,
          organization_id
        `
        )
        .eq("organization_id", organizationId)
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as Activity[];
    },
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 2 * 60 * 1000,
  });
}

export default useAllActivities;
