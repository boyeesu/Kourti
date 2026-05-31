import { useQuery } from '@tanstack/react-query';

import { invokeNodeApi } from '@/lib/backendApi';
import { usePlatformAdmin } from './usePlatformAdmin';

export type AdminCapability =
  | 'platform.read'
  | 'users.manage'
  | 'billing.manage'
  | 'impersonate.read'
  | 'impersonate.write'
  | 'storage.manage'
  | 'content.manage'
  | 'rules.manage'
  | 'superadmin';

interface AdminMe {
  userId: string;
  capabilities: AdminCapability[];
  isPlatformStaff: boolean;
}

/**
 * The current admin's capability set, from GET /api/v1/admin/me. Drives which
 * /thanos tabs are shown so scoped support/billing staff only see what they can
 * use. The backend still enforces every capability per-route — this is UX only.
 */
export function useAdminCapabilities() {
  const { data: isPlatformAdmin } = usePlatformAdmin();
  const query = useQuery({
    queryKey: ['admin-capabilities'],
    enabled: !!isPlatformAdmin,
    queryFn: () => invokeNodeApi<AdminMe>('/api/v1/admin/me'),
    staleTime: 5 * 60 * 1000,
  });

  const caps = new Set<AdminCapability>(query.data?.capabilities ?? []);
  const has = (cap: AdminCapability) => caps.has(cap) || caps.has('superadmin');

  return { ...query, capabilities: caps, has };
}
