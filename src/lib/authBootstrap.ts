import { env } from '@/lib/env';
import { isNodeBackendEnabled } from '@/lib/backendApi';
import { getAccessToken } from '@/lib/authClient';

type NodeMeResponse = {
  user?: {
    id?: string;
    email?: string | null;
    organization_id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
  id?: string;
  email?: string | null;
  organization_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

type NodeBootstrapUser = {
  id: string;
  email: string | null;
  organizationId: string | null;
  firstName: string | null;
  lastName: string | null;
};

let cachedNodeUser: NodeBootstrapUser | null = null;
let cachedToken: string | null = null;
let inFlightNodeUserRequest: Promise<NodeBootstrapUser | null> | null = null;

function normalizeNodeMe(payload: unknown): NodeBootstrapUser | null {
  const typedPayload = payload as NodeMeResponse | null;
  const rawUser = typedPayload?.user ?? typedPayload;

  if (!rawUser?.id) {
    return null;
  }

  return {
    id: rawUser.id,
    email: rawUser.email ?? null,
    organizationId: rawUser.organization_id ?? null,
    firstName: rawUser.first_name ?? null,
    lastName: rawUser.last_name ?? null,
  };
}

export async function getNodeBootstrapUser(options?: {
  accessToken?: string | null;
  refresh?: boolean;
}): Promise<NodeBootstrapUser | null> {
  if (!isNodeBackendEnabled()) {
    return null;
  }

  if (options?.refresh) {
    inFlightNodeUserRequest = null;
    cachedNodeUser = null;
    cachedToken = null;
  }

  const accessToken = options?.accessToken ?? getAccessToken();
  if (!accessToken) {
    inFlightNodeUserRequest = null;
    cachedNodeUser = null;
    cachedToken = null;
    return null;
  }

  if (cachedNodeUser && cachedToken === accessToken) {
    return cachedNodeUser;
  }

  if (cachedToken && cachedToken !== accessToken) {
    cachedNodeUser = null;
    inFlightNodeUserRequest = null;
  }

  if (!inFlightNodeUserRequest) {
    inFlightNodeUserRequest = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), env.API_TIMEOUT);

      try {
        const response = await fetch(new URL('/api/v1/users/me', env.BACKEND_API_URL).toString(), {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          signal: controller.signal,
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          return null;
        }

        const normalized = normalizeNodeMe(payload);
        cachedToken = accessToken;
        cachedNodeUser = normalized;
        return normalized;
      } finally {
        clearTimeout(timeout);
        inFlightNodeUserRequest = null;
      }
    })();
  }

  return inFlightNodeUserRequest;
}

/**
 * Maps a Node bootstrap user to a shape compatible with auth consumers.
 * The fallbackUser parameter is kept for backward compatibility but
 * no longer references Supabase types -- it accepts any object.
 */
export function mapNodeBootstrapUserToAuthUser(nodeUser: NodeBootstrapUser): {
  id: string;
  email: string;
  organizationId: string | null;
  firstName: string | null;
  lastName: string | null;
} {
  return {
    id: nodeUser.id,
    email: nodeUser.email ?? '',
    organizationId: nodeUser.organizationId,
    firstName: nodeUser.firstName,
    lastName: nodeUser.lastName,
  };
}

export function clearNodeBootstrapUserCache() {
  cachedNodeUser = null;
  cachedToken = null;
  inFlightNodeUserRequest = null;
}
