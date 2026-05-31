import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { invokeNodeApi } from '@/lib/backendApi';
import { logError } from '@/lib/logger';
import { usePlatformAdmin } from './usePlatformAdmin';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PortalAdminClientListItem {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
  case_access_count: number;
  firm_count: number;
  client_level_count: number;
}

export interface PortalAdminClientProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  is_active: boolean;
  email_verified_at: string | null;
  last_sign_in_at: string | null;
  has_pending_invite: boolean;
  invite_expires_at: string | null;
  has_password: boolean;
  created_at: string;
  updated_at: string;
}

export interface PortalAdminCaseLink {
  id: string;
  case_id: string;
  organization_id: string;
  client_id: string | null;
  role: string;
  status: string;
  granted_by: string | null;
  created_at: string;
  revoked_at: string | null;
  case_title: string | null;
  organization_name: string | null;
  access_kind: 'case';
}

export interface PortalAdminClientLevelLink {
  id: string;
  client_id: string;
  organization_id: string;
  role: string;
  status: string;
  granted_by: string | null;
  granted_by_type: string;
  created_at: string;
  revoked_at: string | null;
  client_name: string | null;
  organization_name: string | null;
  access_kind: 'client_level';
}

export interface PortalAdminFirmContact {
  id: string;
  organization_id: string;
  name: string | null;
  email: string | null;
  portal_enabled: boolean;
  organization_name: string | null;
}

export interface PortalAdminClientDetail {
  client: PortalAdminClientProfile;
  caseLinks: PortalAdminCaseLink[];
  clientLevelLinks: PortalAdminClientLevelLink[];
  firmContacts: PortalAdminFirmContact[];
}

export interface PortalAdminFirmLink {
  organization_id: string;
  organization_name: string | null;
  explicit_case_count: number;
  client_level_count: number;
}

interface ListResponse {
  items: PortalAdminClientListItem[];
  limit: number;
  offset: number;
}

// ── Reads ────────────────────────────────────────────────────────────────────

export function usePortalAdminClients(params: { q?: string; limit?: number; offset?: number }) {
  const { data: isPlatformAdmin } = usePlatformAdmin();
  return useQuery({
    queryKey: ['portal-admin-clients', params],
    enabled: !!isPlatformAdmin,
    queryFn: async () => {
      try {
        return await invokeNodeApi<ListResponse>('/api/v1/admin/portal-admin/clients', {
          query: {
            q: params.q,
            limit: params.limit,
            offset: params.offset,
          },
        });
      } catch (error) {
        logError('Error fetching portal admin clients', error);
        throw error;
      }
    },
    staleTime: 10 * 1000,
  });
}

export function usePortalAdminClient(clientId: string | null) {
  const { data: isPlatformAdmin } = usePlatformAdmin();
  return useQuery({
    queryKey: ['portal-admin-client', clientId],
    enabled: !!isPlatformAdmin && !!clientId,
    queryFn: async () => {
      try {
        return await invokeNodeApi<PortalAdminClientDetail>(
          `/api/v1/admin/portal-admin/clients/${clientId}`
        );
      } catch (error) {
        logError('Error fetching portal admin client', error);
        throw error;
      }
    },
  });
}

export function usePortalAdminClientLinks(clientId: string | null) {
  const { data: isPlatformAdmin } = usePlatformAdmin();
  return useQuery({
    queryKey: ['portal-admin-client-links', clientId],
    enabled: !!isPlatformAdmin && !!clientId,
    queryFn: async () => {
      try {
        const data = await invokeNodeApi<{ items: PortalAdminFirmLink[] }>(
          `/api/v1/admin/portal-admin/clients/${clientId}/links`
        );
        return data.items;
      } catch (error) {
        logError('Error fetching portal admin client links', error);
        throw error;
      }
    },
  });
}

// ── Mutations ────────────────────────────────────────────────────────────────

export function useResendPortalInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { clientId: string; reason: string }) =>
      invokeNodeApi<{ ok: boolean; emailSent: boolean; emailError: string | null }>(
        `/api/v1/admin/portal-admin/clients/${params.clientId}/resend-invite`,
        { method: 'POST', body: { reason: params.reason } }
      ),
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['portal-admin-client', vars.clientId] });
      if (data.emailSent) {
        toast.success('Invite re-sent');
      } else {
        toast.warning('Invite token re-issued, but the email failed to send', {
          description: data.emailError ?? undefined,
        });
      }
    },
    onError: (error) => {
      toast.error('Failed to resend invite', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

export function useDisablePortalClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { clientId: string; reason: string }) =>
      invokeNodeApi<{ id: string; is_active: boolean }>(
        `/api/v1/admin/portal-admin/clients/${params.clientId}/disable`,
        { method: 'POST', body: { reason: params.reason } }
      ),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['portal-admin-clients'] });
      queryClient.invalidateQueries({ queryKey: ['portal-admin-client', vars.clientId] });
      toast.success('Client identity disabled');
    },
    onError: (error) => {
      toast.error('Failed to disable client', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

export function useMergePortalClients() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { primaryId: string; duplicateId: string; reason: string }) =>
      invokeNodeApi<{
        ok: boolean;
        primaryId: string;
        duplicateId: string;
        movedCaseAccess: number;
        movedClientAccess: number;
        duplicateDisposition: string;
      }>('/api/v1/admin/portal-admin/clients/merge', {
        method: 'POST',
        body: {
          primaryId: params.primaryId,
          duplicateId: params.duplicateId,
          reason: params.reason,
        },
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['portal-admin-clients'] });
      queryClient.invalidateQueries({ queryKey: ['portal-admin-client', data.primaryId] });
      queryClient.invalidateQueries({ queryKey: ['portal-admin-client', data.duplicateId] });
      toast.success('Clients merged', {
        description: `Moved ${data.movedCaseAccess + data.movedClientAccess} access grant(s); duplicate ${data.duplicateDisposition}.`,
      });
    },
    onError: (error) => {
      toast.error('Failed to merge clients', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}
