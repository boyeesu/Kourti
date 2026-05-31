import { useQuery } from '@tanstack/react-query';

import { invokeNodeApi } from '@/lib/backendApi';
import { env } from '@/lib/env';
import { getAccessToken, refreshSession } from '@/lib/authClient';
import { logError } from '@/lib/logger';
import { usePlatformAdmin } from './usePlatformAdmin';

type QueryValue = string | number | boolean | null | undefined;

/** A single audit row as returned by GET /api/v1/admin/audit/actions. */
export interface AuditProAction {
  id: string;
  admin_user_id: string;
  admin_email: string | null;
  action_type: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown> | null;
  reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

/** Full single-action detail, incl. before/after snapshots. */
export interface AuditProActionDetail extends AuditProAction {
  before_state: unknown;
  after_state: unknown;
}

export interface AuditProFilters {
  admin_user_id?: string;
  action_type?: string;
  target_type?: string;
  target_id?: string;
  start_date?: string;
  end_date?: string;
  q?: string;
}

export interface AuditProListResult {
  rows: AuditProAction[];
  total: number;
}

/** Strip empty/undefined values so we never send blank query params. */
function toQuery(filters: AuditProFilters): Record<string, QueryValue> {
  const out: Record<string, QueryValue> = {};
  (Object.keys(filters) as (keyof AuditProFilters)[]).forEach((k) => {
    const v = filters[k];
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  });
  return out;
}

/** Paginated, filtered audit list. */
export function useAuditProActions(
  filters: AuditProFilters,
  page: { limit: number; offset: number }
) {
  const { data: isPlatformAdmin } = usePlatformAdmin();
  return useQuery({
    queryKey: ['audit-pro-actions', filters, page],
    enabled: !!isPlatformAdmin,
    queryFn: async () => {
      try {
        return await invokeNodeApi<AuditProListResult>('/api/v1/admin/audit/actions', {
          query: { ...toQuery(filters), limit: page.limit, offset: page.offset },
        });
      } catch (error) {
        logError('Error fetching audit actions', error);
        throw error;
      }
    },
    staleTime: 10 * 1000,
  });
}

/** Distinct action_type values for the filter dropdown. */
export function useAuditProActionTypes() {
  const { data: isPlatformAdmin } = usePlatformAdmin();
  return useQuery({
    queryKey: ['audit-pro-action-types'],
    enabled: !!isPlatformAdmin,
    queryFn: async () => {
      try {
        return await invokeNodeApi<string[]>('/api/v1/admin/audit/action-types');
      } catch (error) {
        logError('Error fetching audit action types', error);
        throw error;
      }
    },
    staleTime: 60 * 1000,
  });
}

/** Single action with full before/after snapshots — fetched on row expand. */
export function useAuditProAction(id: string | null) {
  const { data: isPlatformAdmin } = usePlatformAdmin();
  return useQuery({
    queryKey: ['audit-pro-action', id],
    enabled: !!isPlatformAdmin && !!id,
    queryFn: async () => {
      try {
        return await invokeNodeApi<AuditProActionDetail>(`/api/v1/admin/audit/actions/${id}`);
      } catch (error) {
        logError('Error fetching audit action detail', error);
        throw error;
      }
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Trigger a CSV download honouring the current filters.
 *
 * A file download cannot use a plain <a href> because the endpoint requires a
 * Bearer token (it lives behind requireAuth + a capability check). So we fetch
 * with the Authorization header just like invokeNodeApi does, read the response
 * as a Blob, and synthesise an object-URL anchor click. The access token is
 * resolved (and refreshed if stale) before the request.
 */
export async function downloadAuditCsv(filters: AuditProFilters): Promise<void> {
  let token = getAccessToken();
  if (!token) {
    // Mirror backendApi: fall back to a cookie-based refresh if the in-memory
    // access token has expired.
    token = (await refreshSession()).accessToken;
  }

  const url = new URL('/api/v1/admin/audit/export.csv', env.BACKEND_API_URL);
  const q = toQuery(filters);
  Object.entries(q).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
  });

  if (!response.ok) {
    const msg = await response.text().catch(() => '');
    throw new Error(msg || `CSV export failed (${response.status})`);
  }

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = 'audit-log.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(objectUrl);
}
