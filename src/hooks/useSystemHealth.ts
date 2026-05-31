import { useQuery } from '@tanstack/react-query';

import { invokeNodeApi } from '@/lib/backendApi';
import { logError } from '@/lib/logger';

import { usePlatformAdmin } from './usePlatformAdmin';

// ── Shapes mirror GET /api/v1/admin/system/health ───────────────────────────
// Every section can be `null` when its backing table/column isn't present, so
// the UI must guard for null on each block.

export interface SystemHealthDb {
  ok: boolean;
  latency_ms: number | null;
}

export interface SystemHealthBackgroundJobs {
  queued: number;
  running: number;
  failed: number;
  completed: number;
  other: number;
  total_24h: number;
  oldest_queued_age_seconds: number | null;
}

export interface SystemHealthEmail {
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  failed: number;
  queued: number;
  total_24h: number;
  bounce_rate: number | null;
}

export interface SystemHealthPayments {
  by_status: Record<string, number>;
  total_24h: number;
}

export interface SystemHealthWebhooks {
  provider: string;
  last_received_at: string | null;
  received_24h: number;
}

export interface SystemHealthImpersonation {
  active: number;
}

export interface SystemHealthLeads {
  by_status: Record<string, number>;
  total: number;
}

export interface SystemHealthProcess {
  uptime_seconds: number;
  memory_rss_bytes: number;
  memory_heap_used_bytes: number;
  node_env: string;
}

export interface SystemHealth {
  generated_at: string;
  db: SystemHealthDb;
  background_jobs: SystemHealthBackgroundJobs | null;
  email: SystemHealthEmail | null;
  payments: SystemHealthPayments | null;
  webhooks: SystemHealthWebhooks | null;
  impersonation: SystemHealthImpersonation | null;
  leads: SystemHealthLeads | null;
  process: SystemHealthProcess;
}

export interface SystemJob {
  id: string;
  status: string;
  type: string | null;
  created_at: string;
  error: string | null;
}

const REFRESH_MS = 15_000;

/** Aggregate system-health dashboard, auto-refreshed every ~15s. */
export function useSystemHealth() {
  const { data: isPlatformAdmin } = usePlatformAdmin();

  return useQuery({
    queryKey: ['system-health'],
    enabled: !!isPlatformAdmin,
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      try {
        return await invokeNodeApi<SystemHealth>('/api/v1/admin/system/health');
      } catch (error) {
        logError('Error fetching system health', error);
        throw error;
      }
    },
  });
}

/** Recent background jobs (last 50), auto-refreshed every ~15s. */
export function useSystemJobs() {
  const { data: isPlatformAdmin } = usePlatformAdmin();

  return useQuery({
    queryKey: ['system-jobs'],
    enabled: !!isPlatformAdmin,
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      try {
        return await invokeNodeApi<SystemJob[]>('/api/v1/admin/system/jobs');
      } catch (error) {
        logError('Error fetching system jobs', error);
        throw error;
      }
    },
  });
}
