import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invokeNodeApi } from '@/lib/backendApi';
import { env } from '@/lib/env';
import { getAccessToken, refreshSession } from '@/lib/authClient';
import { logError } from '@/lib/logger';

export type BulkAction = 'approve' | 'disable' | 'delete';

interface BulkParams {
  action: BulkAction;
  userIds: string[];
  reason: string;
}

/**
 * Bulk approve / disable / delete users. One network call per batch; the
 * backend writes a single audit row. Invalidates the platform user lists on
 * success so the table reflects the new statuses.
 */
export function useBulkUserAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ action, userIds, reason }: BulkParams) => {
      return invokeNodeApi<{ updated: number }>(`/api/v1/admin/bulk/users/${action}`, {
        method: 'POST',
        body: { userIds, reason },
      });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-actions'] });
      toast.success('Bulk action complete', {
        description: `${data.updated} user${data.updated === 1 ? '' : 's'} ${variables.action}d.`,
      });
    },
    onError: (error) => {
      logError('Bulk user action failed', error);
      toast.error('Bulk action failed', {
        description: error instanceof Error ? error.message : 'Unexpected error',
      });
    },
  });
}

async function authedAccessToken(): Promise<string> {
  const token = getAccessToken();
  if (token) return token;
  const session = await refreshSession();
  return session.accessToken;
}

/**
 * Download an authenticated CSV export. fetch() is used directly (rather than
 * invokeNodeApi, which assumes JSON) so we can attach the Bearer token, read
 * the response as a Blob, and trigger a browser download via an object URL.
 */
export async function downloadAdminCsv(
  path: string,
  filename: string,
  query?: Record<string, string | undefined>
): Promise<void> {
  const token = await authedAccessToken();

  const url = new URL(path, env.BACKEND_API_URL);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v);
    });
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
  });

  if (!res.ok) {
    let message = `Export failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      message = body?.error || body?.message || message;
    } catch {
      /* response was not JSON (or empty) — keep the status-code message */
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(objectUrl);
}
