import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { invokeNodeApi } from '@/lib/backendApi';
import { env } from '@/lib/env';
import { getAccessToken, refreshSession } from '@/lib/authClient';
import { logError } from '@/lib/logger';
import { usePlatformAdmin } from './usePlatformAdmin';

type QueryValue = string | number | boolean | null | undefined;

export type LeadType = 'assessment' | 'report' | 'contact';
export type LeadStatus = 'new' | 'in_progress' | 'resolved';

/** Assessment extras stored in contact_submissions.metadata by /public/assessment. */
export interface AssessmentMetadata {
  tier?: string;
  totalScore?: number;
  maxScore?: number;
  dimensionScores?: Record<string, number>;
  answers?: Record<string, string | number>;
}

export interface MarketingLeadRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  company: string | null;
  phone: string | null;
  firm_size: string | null;
  interest: string;
  message: string;
  source: string;
  metadata: AssessmentMetadata & Record<string, unknown>;
  status: LeadStatus;
  marketing_consent: boolean;
  created_at: string;
  lead_type: LeadType;
}

export interface MarketingLeadsResponse {
  rows: MarketingLeadRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface MarketingLeadFilters {
  q?: string;
  type?: LeadType;
  status?: LeadStatus;
  marketing_consent?: boolean;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

interface LeadTypeStats {
  total: number;
  last_30d: number;
  new: number;
  consented: number;
}

export interface MarketingLeadStats {
  overall: LeadTypeStats;
  by_type: Record<LeadType, LeadTypeStats>;
}

/** Strip empty/undefined values so we never send blank query params. */
function toQuery(filters: MarketingLeadFilters): Record<string, QueryValue> {
  const out: Record<string, QueryValue> = {};
  (Object.keys(filters) as (keyof MarketingLeadFilters)[]).forEach((k) => {
    const v = filters[k];
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  });
  return out;
}

/** Fetch marketing leads (assessments, report downloads, contact enquiries). */
export function useMarketingLeads(filters?: MarketingLeadFilters) {
  const { data: isPlatformAdmin } = usePlatformAdmin();
  return useQuery({
    queryKey: ['admin-marketing-leads', filters],
    enabled: !!isPlatformAdmin,
    queryFn: async () => {
      try {
        return await invokeNodeApi<MarketingLeadsResponse>('/api/v1/admin/leads', {
          query: toQuery(filters || {}),
        });
      } catch (error) {
        logError('Error fetching marketing leads', error);
        throw error;
      }
    },
    staleTime: 10 * 1000,
  });
}

/** Lead totals (overall + per type), 30-day counts, consent counts. */
export function useMarketingLeadStats() {
  const { data: isPlatformAdmin } = usePlatformAdmin();
  return useQuery({
    queryKey: ['admin-marketing-lead-stats'],
    enabled: !!isPlatformAdmin,
    queryFn: async () => {
      try {
        return await invokeNodeApi<MarketingLeadStats>('/api/v1/admin/leads/stats');
      } catch (error) {
        logError('Error fetching marketing lead stats', error);
        throw error;
      }
    },
    staleTime: 30 * 1000,
  });
}

/** Change a lead's triage status (content.manage). */
export function useUpdateLeadStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { id: string; status: LeadStatus }) => {
      return invokeNodeApi<{ id: string; status: LeadStatus }>(
        `/api/v1/admin/leads/${params.id}/status`,
        { method: 'PATCH', body: { status: params.status } }
      );
    },
    onSuccess: () => {
      toast.success('Lead status updated');
      queryClient.invalidateQueries({ queryKey: ['admin-marketing-leads'] });
      queryClient.invalidateQueries({ queryKey: ['admin-marketing-lead-stats'] });
    },
    onError: (error) => {
      logError('Error updating lead status', error);
      toast.error('Update failed', {
        description: error instanceof Error ? error.message : 'Could not update the lead',
      });
    },
  });
}

/**
 * Trigger a CSV download honouring the current filters. Same approach as the
 * audit export: the endpoint needs a Bearer token, so fetch as a Blob and
 * synthesise an object-URL anchor click.
 */
export async function downloadLeadsCsv(filters: MarketingLeadFilters): Promise<void> {
  let token = getAccessToken();
  if (!token) {
    token = (await refreshSession()).accessToken;
  }

  const url = new URL('/api/v1/admin/leads/export.csv', env.BACKEND_API_URL);
  const q = toQuery(filters);
  delete q.limit; // export ignores pagination — it returns all matching rows
  delete q.offset;
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
  a.download = 'marketing-leads.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(objectUrl);
}
