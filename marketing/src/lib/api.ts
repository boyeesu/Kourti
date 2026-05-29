/**
 * Thin client for the Kourti backend's public API (kourti.com → backend).
 *
 * The marketing site is unauthenticated; it only ever hits `/api/v1/public/*`.
 * Base URL comes from VITE_BACKEND_API_URL (the backend Railway service URL).
 */

const BACKEND_API_URL = (import.meta.env.VITE_BACKEND_API_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!BACKEND_API_URL) {
    throw new ApiError('VITE_BACKEND_API_URL is not configured', 0);
  }

  const res = await fetch(`${BACKEND_API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message = (data && (data.error || data.message)) || `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export function getJson<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}

export function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

// ── Public types ─────────────────────────────────────────────────────────────

export interface PublicPlan {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  plan_type: 'free' | 'starter' | 'professional' | 'enterprise' | string;
  features: string[];
  price_monthly: number | null;
  price_yearly: number | null;
  currency: string;
  highlight: boolean;
}

export function fetchPublicPlans(): Promise<PublicPlan[]> {
  return getJson<PublicPlan[]>('/api/v1/public/plans');
}
