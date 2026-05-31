import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePlatformAdmin } from './usePlatformAdmin';
import { logError } from '@/lib/logger';
import { invokeNodeApi } from '@/lib/backendApi';

type QueryValue = string | number | boolean | null | undefined;

export type EmailProvider = 'resend' | 'brevo';
export type EmailDeliveryStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'bounced'
  | 'complained'
  | 'failed';

export interface EmailLogRow {
  id: string;
  provider: EmailProvider;
  to_email: string;
  subject: string | null;
  template: string | null;
  provider_message_id: string | null;
  status: EmailDeliveryStatus;
  error: string | null;
  organization_id: string | null;
  user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EmailLogResponse {
  rows: EmailLogRow[];
  limit: number;
  offset: number;
  count: number;
}

export interface EmailLogFilters {
  to_email?: string;
  provider?: EmailProvider;
  status?: EmailDeliveryStatus;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

export interface EmailStats {
  window_days: number;
  total: number;
  by_status: Record<EmailDeliveryStatus, number>;
  bounce_rate: number;
  complaint_rate: number;
  failure_rate: number;
}

/** Fetch the email deliverability log with optional filters. */
export function useEmailLog(filters?: EmailLogFilters) {
  const { data: isPlatformAdmin } = usePlatformAdmin();
  return useQuery({
    queryKey: ['admin-email-log', filters],
    enabled: !!isPlatformAdmin,
    queryFn: async () => {
      try {
        return invokeNodeApi<EmailLogResponse>('/api/v1/admin/email/log', {
          query: (filters || {}) as Record<string, QueryValue>,
        });
      } catch (error) {
        logError('Error fetching email log', error);
        throw error;
      }
    },
    staleTime: 10 * 1000,
  });
}

/** Fetch the 30-day deliverability stats rollup. */
export function useEmailStats() {
  const { data: isPlatformAdmin } = usePlatformAdmin();
  return useQuery({
    queryKey: ['admin-email-stats'],
    enabled: !!isPlatformAdmin,
    queryFn: async () => {
      try {
        return invokeNodeApi<EmailStats>('/api/v1/admin/email/stats');
      } catch (error) {
        logError('Error fetching email stats', error);
        throw error;
      }
    },
    staleTime: 30 * 1000,
  });
}

/** Resend a logged email (content.manage). Requires a reason. */
export function useResendEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { id: string; reason: string }) => {
      return invokeNodeApi<{ resent: boolean; to: string; provider_message_id: string | null }>(
        `/api/v1/admin/email/${params.id}/resend`,
        {
          method: 'POST',
          body: { reason: params.reason },
        }
      );
    },
    onSuccess: (result) => {
      toast.success('Email resent', {
        description: `Re-delivered to ${result.to}`,
      });
      queryClient.invalidateQueries({ queryKey: ['admin-email-log'] });
      queryClient.invalidateQueries({ queryKey: ['admin-email-stats'] });
    },
    onError: (error) => {
      logError('Error resending email', error);
      toast.error('Resend failed', {
        description: error instanceof Error ? error.message : 'Could not resend the email',
      });
    },
  });
}
