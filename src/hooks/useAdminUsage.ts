import { useQuery } from '@tanstack/react-query';

import { invokeNodeApi } from '@/lib/backendApi';
import { logError } from '@/lib/logger';

import { usePlatformAdmin } from './usePlatformAdmin';

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

export interface OrgUsageMembers {
  total: number | null;
  active: number | null;
  disabled: number | null;
  last_active: string | null;
}

export interface OrgUsageSubscription {
  status: string | null;
  billing_interval: string | null;
  current_period_end: string | null;
  plan_name: string | null;
  plan_display_name: string | null;
  plan_type: string | null;
}

export interface OrgUsageCounts {
  documents: number | null;
  cases: number | null;
  clients: number | null;
  contracts: number | null;
  invoices: number | null;
  calendar_events: number | null;
  agent_jobs: number | null;
  negotiations: number | null;
  tabular_reviews: number | null;
}

export interface OrgUsageFeatures {
  has_agents: boolean;
  has_negotiations: boolean;
  has_tabular_reviews: boolean;
}

export interface OrgUsage {
  organization: {
    id: string;
    name: string | null;
    status: string | null;
    is_active: boolean | null;
    created_at?: string | null;
  };
  members: OrgUsageMembers;
  subscription: OrgUsageSubscription | null;
  counts: OrgUsageCounts;
  features: OrgUsageFeatures;
  storage: { documents_bytes: number | null };
}

export interface UsageLeaderboardRow {
  organization_id: string;
  name: string | null;
  members: number;
  documents: number;
  subscription_status: string | null;
}

export interface UsageLeaderboards {
  top_by_members: UsageLeaderboardRow[];
  top_by_documents: UsageLeaderboardRow[];
}

/**
 * Per-org usage & health cockpit. Only fires for a valid org UUID and when the
 * caller is a platform admin (same gate as the rest of the Thanos panel).
 */
export function useOrgUsage(orgId: string | null) {
  const { data: isPlatformAdmin } = usePlatformAdmin();
  const valid = !!orgId && UUID_RE.test(orgId);

  return useQuery({
    queryKey: ['admin-org-usage', orgId],
    enabled: !!isPlatformAdmin && valid,
    queryFn: async () => {
      try {
        return await invokeNodeApi<OrgUsage>(`/api/v1/admin/organizations/${orgId}/usage`);
      } catch (error) {
        logError('Error fetching org usage', error);
        throw error;
      }
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Platform-wide leaderboards: top orgs by member count and by document count.
 */
export function useUsageLeaderboards() {
  const { data: isPlatformAdmin } = usePlatformAdmin();

  return useQuery({
    queryKey: ['admin-usage-leaderboards'],
    enabled: !!isPlatformAdmin,
    queryFn: async () => {
      try {
        return await invokeNodeApi<UsageLeaderboards>('/api/v1/admin/usage/orgs');
      } catch (error) {
        logError('Error fetching usage leaderboards', error);
        throw error;
      }
    },
    staleTime: 60 * 1000,
  });
}
