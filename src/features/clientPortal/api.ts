import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invokeNodeApi } from '@/lib/backendApi';

const BASE = '/api/v1/client-portal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortalAccessRow {
  id: string;
  client_user_id: string;
  role: string;
  status: string;
  granted_by: string | null;
  created_at: string;
  revoked_at: string | null;
  email: string | null;
  full_name: string | null;
  last_sign_in_at: string | null;
  email_verified_at: string | null;
}

export interface PortalEvent {
  id: string;
  event_type: string;
  title: string | null;
  body: string | null;
  payload: unknown;
  actor_type: string | null;
  client_visible: boolean;
  notified_at: string | null;
  occurred_at: string;
  created_at: string;
}

export type DigestStatus = 'draft' | 'approved' | 'sent' | 'failed' | string;

export interface PortalDigest {
  id: string;
  status: DigestStatus;
  channel: string;
  subject: string | null;
  body_md: string | null;
  event_ids: string[];
  approved_at: string | null;
  sent_at: string | null;
  error: string | null;
  created_at: string;
}

export interface PortalDocument {
  id: string;
  name: string;
  mimeType: string | null;
  fileSize: number | null;
  clientVisible: boolean;
  createdAt: string;
}

export type PortalStatus = 'none' | 'pending' | 'active';

export interface ClientPortalMatter {
  id: string;
  title: string;
  status: string | null;
  portalPrivate: boolean;
}

/** Client-level portal status, backing the Clients list action + the Client
 *  Details portal section. */
export interface ClientPortalStatus {
  clientId: string;
  email: string | null;
  status: PortalStatus;
  portalEnabled: boolean;
  clientUserId: string | null;
  emailVerifiedAt: string | null;
  lastSignInAt: string | null;
  matters: ClientPortalMatter[];
}

interface ListResponse<T> {
  items: T[];
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const clientPortalKeys = {
  access: (caseId: string) => ['clientPortal', caseId, 'access'] as const,
  events: (caseId: string) => ['clientPortal', caseId, 'events'] as const,
  digests: (caseId: string) => ['clientPortal', caseId, 'digests'] as const,
  documents: (caseId: string) => ['clientPortal', caseId, 'documents'] as const,
  clientStatus: (clientId: string) => ['clientPortal', 'client', clientId] as const,
};

// ---------------------------------------------------------------------------
// Client-level portal access (the primary flow). 2FA is always enforced
// server-side, so there is no firm-wide settings toggle here anymore.
// ---------------------------------------------------------------------------

export function useClientPortalStatus(
  clientId: string,
  options?: Partial<UseQueryOptions<ClientPortalStatus>>
) {
  return useQuery({
    queryKey: clientPortalKeys.clientStatus(clientId),
    queryFn: () => invokeNodeApi<ClientPortalStatus>(`${BASE}/clients/${clientId}/portal`),
    enabled: !!clientId,
    ...options,
  });
}

export function useEnableClientPortal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) =>
      invokeNodeApi<{ status: PortalStatus }>(`${BASE}/clients/${clientId}/enable`, {
        method: 'POST',
      }),
    onSuccess: (_data, clientId) => {
      queryClient.invalidateQueries({ queryKey: clientPortalKeys.clientStatus(clientId) });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Portal invitation sent');
    },
    onError: (error: Error) => {
      toast.error('Could not enable the client portal', { description: error.message });
    },
  });
}

export function useDisableClientPortal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) =>
      invokeNodeApi<{ status: PortalStatus }>(`${BASE}/clients/${clientId}/disable`, {
        method: 'POST',
      }),
    onSuccess: (_data, clientId) => {
      queryClient.invalidateQueries({ queryKey: clientPortalKeys.clientStatus(clientId) });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Portal access disabled');
    },
    onError: (error: Error) => {
      toast.error('Could not disable the client portal', { description: error.message });
    },
  });
}

// ---------------------------------------------------------------------------
// Access (matter-scoped, read-only listing for the matter portal panel)
// ---------------------------------------------------------------------------

export function useCasePortalAccess(
  caseId: string,
  options?: Partial<UseQueryOptions<PortalAccessRow[]>>
) {
  return useQuery({
    queryKey: clientPortalKeys.access(caseId),
    queryFn: async () => {
      const res = await invokeNodeApi<ListResponse<PortalAccessRow>>(
        `${BASE}/cases/${caseId}/access`
      );
      return res.items ?? [];
    },
    enabled: !!caseId,
    ...options,
  });
}

export function useRevokeAccess(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (clientUserId: string) =>
      invokeNodeApi<PortalAccessRow | null>(`${BASE}/cases/${caseId}/access/${clientUserId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientPortalKeys.access(caseId) });
      toast.success('Access revoked');
    },
    onError: (error: Error) => {
      toast.error('Could not revoke access', { description: error.message });
    },
  });
}

export function useSetPortalPrivate(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (isPrivate: boolean) =>
      invokeNodeApi<{ caseId: string; portalPrivate: boolean }>(`${BASE}/cases/${caseId}/private`, {
        method: 'PATCH',
        body: { private: isPrivate },
      }),
    onSuccess: (data) => {
      // Reflect the change on the case record so the page stays in sync.
      queryClient.invalidateQueries({ queryKey: ['case', caseId] });
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      toast.success(
        data.portalPrivate ? 'Portal set to private' : 'Portal is now visible to client'
      );
    },
    onError: (error: Error) => {
      toast.error('Could not update portal visibility', { description: error.message });
    },
  });
}

// ---------------------------------------------------------------------------
// Client summary
// ---------------------------------------------------------------------------

export function useSetClientSummary(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (clientSummary: string | null) =>
      invokeNodeApi<{ id: string; client_summary: string | null }>(
        `${BASE}/cases/${caseId}/summary`,
        { method: 'PATCH', body: { clientSummary } }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case', caseId] });
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      toast.success('Client summary saved');
    },
    onError: (error: Error) => {
      toast.error('Could not save client summary', { description: error.message });
    },
  });
}

// ---------------------------------------------------------------------------
// Events / timeline
// ---------------------------------------------------------------------------

export function useCasePortalEvents(
  caseId: string,
  options?: Partial<UseQueryOptions<PortalEvent[]>>
) {
  return useQuery({
    queryKey: clientPortalKeys.events(caseId),
    queryFn: async () => {
      const res = await invokeNodeApi<ListResponse<PortalEvent>>(`${BASE}/cases/${caseId}/events`);
      return res.items ?? [];
    },
    enabled: !!caseId,
    ...options,
  });
}

export function useToggleEventVisibility(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, clientVisible }: { eventId: string; clientVisible: boolean }) =>
      invokeNodeApi<{ id: string; client_visible: boolean }>(
        `${BASE}/cases/${caseId}/events/${eventId}`,
        { method: 'PATCH', body: { clientVisible } }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientPortalKeys.events(caseId) });
    },
    onError: (error: Error) => {
      toast.error('Could not update visibility', { description: error.message });
    },
  });
}

export function usePostEvent(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      eventType: string;
      title?: string;
      body?: string;
      clientVisible?: boolean;
    }) =>
      invokeNodeApi<{ ok: true }>(`${BASE}/cases/${caseId}/events`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientPortalKeys.events(caseId) });
      toast.success('Update posted');
    },
    onError: (error: Error) => {
      toast.error('Could not post update', { description: error.message });
    },
  });
}

// ---------------------------------------------------------------------------
// Digests / updates
// ---------------------------------------------------------------------------

export function useCasePortalDigests(
  caseId: string,
  options?: Partial<UseQueryOptions<PortalDigest[]>>
) {
  return useQuery({
    queryKey: clientPortalKeys.digests(caseId),
    queryFn: async () => {
      const res = await invokeNodeApi<ListResponse<PortalDigest>>(
        `${BASE}/cases/${caseId}/digests`
      );
      return res.items ?? [];
    },
    enabled: !!caseId,
    ...options,
  });
}

export function useGenerateDigest(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      invokeNodeApi<{ jobId: string; status: string; createdAt: string }>(
        `${BASE}/cases/${caseId}/digests/generate`,
        { method: 'POST' }
      ),
    onSuccess: () => {
      toast.success('Draft is being generated');
      // The draft is produced asynchronously — refetch shortly after.
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: clientPortalKeys.digests(caseId) });
      }, 3000);
    },
    onError: (error: Error) => {
      toast.error('Could not generate draft', { description: error.message });
    },
  });
}

export function useApproveDigest(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (digestId: string) =>
      invokeNodeApi<{ id: string; status: string; sent_at: string | null }>(
        `${BASE}/digests/${digestId}/approve`,
        { method: 'POST' }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientPortalKeys.digests(caseId) });
      toast.success('Update sent');
    },
    onError: (error: Error) => {
      toast.error('Could not send update', { description: error.message });
    },
  });
}

export function useDiscardDigest(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (digestId: string) =>
      invokeNodeApi<{ id: string; status: string }>(`${BASE}/digests/${digestId}/discard`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientPortalKeys.digests(caseId) });
      toast.success('Draft discarded');
    },
    onError: (error: Error) => {
      toast.error('Could not discard draft', { description: error.message });
    },
  });
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export function useCasePortalDocuments(
  caseId: string,
  options?: Partial<UseQueryOptions<PortalDocument[]>>
) {
  return useQuery({
    queryKey: clientPortalKeys.documents(caseId),
    queryFn: async () => {
      const res = await invokeNodeApi<ListResponse<PortalDocument>>(
        `${BASE}/cases/${caseId}/documents`
      );
      return res.items ?? [];
    },
    enabled: !!caseId,
    ...options,
  });
}

export function useToggleDocumentShare(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, share }: { documentId: string; share: boolean }) =>
      invokeNodeApi<unknown>(`${BASE}/cases/${caseId}/documents/${documentId}/share`, {
        method: share ? 'POST' : 'DELETE',
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: clientPortalKeys.documents(caseId) });
      toast.success(variables.share ? 'Shared with client' : 'Removed from client view');
    },
    onError: (error: Error) => {
      toast.error('Could not update document sharing', { description: error.message });
    },
  });
}
