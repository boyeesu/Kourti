import { env } from '@/lib/env';
import { getAccessToken, refreshSession } from '@/lib/authClient';

type QueryValue = string | number | boolean | null | undefined;

export interface NodeDocumentSignedUrlOptions {
  expiresIn?: number;
  disposition?: 'inline' | 'attachment';
  filename?: string;
}

export interface NodeDocumentSignedUrlResponse {
  signedUrl: string;
  expiresIn: number;
  expiresAt: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  disposition: 'inline' | 'attachment';
}

export interface NodeChatFileSignedUrlResponse {
  signedUrl: string;
  expiresIn: number;
  expiresAt: string;
  fileName?: string;
  disposition: 'inline' | 'attachment';
}

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const url = new URL(path, env.BACKEND_API_URL);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        return;
      }
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

async function getValidAccessToken(): Promise<string> {
  const token = getAccessToken();
  if (token) return token;

  // Token expired or missing -- try refreshing via httpOnly cookie
  try {
    const newSession = await refreshSession();
    return newSession.accessToken;
  } catch {
    throw new Error('Session expired. Please sign in again.');
  }
}

export async function invokeNodeApi<T>(
  path: string,
  options?: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    query?: Record<string, QueryValue>;
    body?: unknown;
    headers?: Record<string, string>;
    /** Override the default API timeout in milliseconds */
    timeout?: number;
  }
): Promise<T> {
  const accessToken = await getValidAccessToken();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options?.timeout ?? env.API_TIMEOUT);

  const response = await fetch(buildUrl(path, options?.query), {
    method: options?.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(options?.headers || {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
    signal: controller.signal,
    credentials: 'include', // Send httpOnly refresh cookie
  }).finally(() => clearTimeout(timeout));

  const data = (await response.json().catch(() => null)) as {
    error?: string;
    message?: string;
  } | null;

  if (!response.ok) {
    if (response.status === 402 && typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (path !== '/pricing' && path !== '/onboarding' && !path.startsWith('/settings/billing')) {
        window.location.assign('/pricing');
      }
    }
    const message = data?.error || data?.message || `Node API request failed (${response.status})`;
    throw new Error(message);
  }

  return data as unknown as T;
}

export async function getNodeDocumentSignedUrl(
  documentId: string,
  options?: NodeDocumentSignedUrlOptions
): Promise<NodeDocumentSignedUrlResponse> {
  return invokeNodeApi<NodeDocumentSignedUrlResponse>(
    `/api/v1/documents/${documentId}/signed-url`,
    {
      query: {
        expiresIn: options?.expiresIn,
        disposition: options?.disposition,
        filename: options?.filename,
      },
    }
  );
}

export async function getNodeChatFileSignedUrl(
  filePath: string,
  options?: NodeDocumentSignedUrlOptions
): Promise<NodeChatFileSignedUrlResponse> {
  return invokeNodeApi<NodeChatFileSignedUrlResponse>('/api/v1/chat/files/signed-url', {
    query: {
      filePath,
      expiresIn: options?.expiresIn,
      disposition: options?.disposition,
      filename: options?.filename,
    },
  });
}
