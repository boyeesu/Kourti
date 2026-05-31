/**
 * Custom JWT auth client.
 *
 * Security model:
 * - Access token: held in memory only (never persisted to storage)
 * - Refresh token: httpOnly cookie set by the backend (not accessible to JS)
 * - On page reload: POST /auth/refresh with cookie to get a new access token
 */
import { env } from '@/lib/env';

// ── Types ───────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  organizationId: string;
  firstName: string | null;
  lastName: string | null;
}

export interface AuthSession {
  accessToken: string;
  expiresAt: number; // epoch ms
  user: AuthUser;
}

export interface AuthError {
  message: string;
  code?: string;
}

type AuthEventType = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'SESSION_EXPIRED';
type AuthListener = (event: AuthEventType, session: AuthSession | null) => void;

// ── Internal state ──────────────────────────────────────────────────────────

let currentSession: AuthSession | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<AuthListener>();

// ── Helpers ─────────────────────────────────────────────────────────────────

function apiUrl(path: string): string {
  return `${env.BACKEND_API_URL}/api/v1/auth${path}`;
}

interface ApiAuthResponse {
  accessToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    organizationId: string;
    firstName: string | null;
    lastName: string | null;
  };
}

export type MfaMethod = 'totp' | 'email_otp';

export interface MfaRequiredResponse {
  mfaRequired: true;
  mfaToken: string;
  expiresIn: number;
  method: MfaMethod;
  emailHint?: string;
}

type SignInResponse = ApiAuthResponse | MfaRequiredResponse;

function isMfaRequired(r: SignInResponse): r is MfaRequiredResponse {
  return (r as MfaRequiredResponse).mfaRequired === true;
}

async function apiCall<T>(
  path: string,
  body?: Record<string, unknown>,
  options?: { includeCredentials?: boolean; accessToken?: string }
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options?.accessToken) {
    headers['Authorization'] = `Bearer ${options.accessToken}`;
  }

  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: options?.includeCredentials !== false ? 'include' : 'omit',
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const err: AuthError = {
      message: data?.error || data?.message || `Auth request failed (${res.status})`,
      code: data?.errorCode,
    };
    throw err;
  }

  return data as T;
}

function toSession(data: ApiAuthResponse): AuthSession {
  return {
    accessToken: data.accessToken,
    expiresAt: Date.now() + data.expiresIn * 1000,
    user: {
      id: data.user.id,
      email: data.user.email,
      organizationId: data.user.organizationId,
      firstName: data.user.firstName,
      lastName: data.user.lastName,
    },
  };
}

function emit(event: AuthEventType, session: AuthSession | null) {
  listeners.forEach((fn) => {
    try {
      fn(event, session);
    } catch {
      /* listener errors shouldn't break auth */
    }
  });
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (!currentSession) return;

  // Refresh 60 seconds before expiry
  const msUntilRefresh = Math.max(currentSession.expiresAt - Date.now() - 60_000, 5_000);

  refreshTimer = setTimeout(async () => {
    try {
      await refreshSession();
    } catch {
      currentSession = null;
      emit('SESSION_EXPIRED', null);
    }
  }, msUntilRefresh);
}

// ── Public API ──────────────────────────────────────────────────────────────

export function onAuthStateChange(listener: AuthListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSession(): AuthSession | null {
  return currentSession;
}

export function getAccessToken(): string | null {
  if (!currentSession) return null;
  if (currentSession.expiresAt < Date.now() + 5_000) return null;
  return currentSession.accessToken;
}

/**
 * Called on app startup. Attempts to refresh the session using the
 * httpOnly refresh cookie. If no cookie exists, returns null.
 */
export async function initSession(): Promise<AuthSession | null> {
  try {
    // POST /refresh with credentials:include sends the httpOnly cookie
    const data = await apiCall<ApiAuthResponse>('/refresh', {}, { includeCredentials: true });
    currentSession = toSession(data);
    scheduleRefresh();
    emit('TOKEN_REFRESHED', currentSession);
    return currentSession;
  } catch {
    // No valid refresh cookie -- user needs to sign in
    currentSession = null;
    return null;
  }
}

export interface SignInOutcome {
  session: AuthSession | null;
  mfa: MfaRequiredResponse | null;
  error: AuthError | null;
}

export async function signIn(email: string, password: string): Promise<SignInOutcome> {
  try {
    const data = await apiCall<SignInResponse>('/sign-in', { email, password });
    if (isMfaRequired(data)) {
      return { session: null, mfa: data, error: null };
    }
    currentSession = toSession(data);
    scheduleRefresh();
    emit('SIGNED_IN', currentSession);
    return { session: currentSession, mfa: null, error: null };
  } catch (err) {
    const authErr = err as AuthError;
    return {
      session: null,
      mfa: null,
      error: { message: authErr.message, code: authErr.code },
    };
  }
}

export async function signUp(
  email: string,
  password: string,
  metadata?: { firstName?: string; lastName?: string; acceptedTerms?: boolean }
): Promise<SignInOutcome> {
  try {
    const data = await apiCall<SignInResponse>('/sign-up', {
      email,
      password,
      firstName: metadata?.firstName,
      lastName: metadata?.lastName,
      acceptedTerms: metadata?.acceptedTerms === true,
    });
    if (isMfaRequired(data)) {
      return { session: null, mfa: data, error: null };
    }
    currentSession = toSession(data);
    scheduleRefresh();
    emit('SIGNED_IN', currentSession);
    return { session: currentSession, mfa: null, error: null };
  } catch (err) {
    const authErr = err as AuthError;
    return {
      session: null,
      mfa: null,
      error: { message: authErr.message, code: authErr.code },
    };
  }
}

/**
 * Redeem an email-OTP MFA challenge for a real session.
 */
export async function verifyEmailOtp(
  mfaToken: string,
  code: string
): Promise<{ session: AuthSession | null; error: AuthError | null }> {
  try {
    const data = await apiCall<ApiAuthResponse>('/2fa/verify-email', { mfaToken, code });
    currentSession = toSession(data);
    scheduleRefresh();
    emit('SIGNED_IN', currentSession);
    return { session: currentSession, error: null };
  } catch (err) {
    const authErr = err as AuthError;
    return { session: null, error: { message: authErr.message, code: authErr.code } };
  }
}

export async function resendEmailOtp(
  mfaToken: string
): Promise<{ error: AuthError | null; emailHint?: string }> {
  try {
    const res = await apiCall<{ ok: true; expiresIn: number; emailHint: string }>(
      '/2fa/resend-email',
      { mfaToken }
    );
    return { error: null, emailHint: res.emailHint };
  } catch (err) {
    return { error: err as AuthError };
  }
}

export async function getEmailOtpSetting(): Promise<{ enabled: boolean }> {
  if (!currentSession?.accessToken) throw new Error('Not authenticated');
  const res = await fetch(apiUrl('/2fa/email-otp'), {
    headers: { Authorization: `Bearer ${currentSession.accessToken}` },
    credentials: 'include',
  });
  const data = (await res.json()) as { enabled: boolean };
  if (!res.ok) throw new Error('Failed to load 2FA setting');
  return data;
}

export async function setEmailOtpSetting(
  enabled: boolean,
  currentPassword: string
): Promise<{ enabled: boolean; error: AuthError | null }> {
  if (!currentSession?.accessToken) {
    return { enabled, error: { message: 'Not authenticated' } };
  }
  try {
    const data = await apiCall<{ enabled: boolean }>(
      '/2fa/email-otp',
      { enabled, currentPassword },
      { accessToken: currentSession.accessToken }
    );
    return { enabled: data.enabled, error: null };
  } catch (err) {
    return { enabled, error: err as AuthError };
  }
}

export async function signOut(): Promise<void> {
  if (refreshTimer) clearTimeout(refreshTimer);

  if (currentSession?.accessToken) {
    try {
      await apiCall(
        '/sign-out',
        {},
        {
          includeCredentials: true,
          accessToken: currentSession.accessToken,
        }
      );
    } catch {
      // Best-effort server-side sign out
    }
  }

  currentSession = null;
  emit('SIGNED_OUT', null);
}

export async function refreshSession(): Promise<AuthSession> {
  const data = await apiCall<ApiAuthResponse>('/refresh', {}, { includeCredentials: true });
  currentSession = toSession(data);
  scheduleRefresh();
  emit('TOKEN_REFRESHED', currentSession);
  return currentSession;
}

export async function resetPassword(email: string): Promise<{ error: AuthError | null }> {
  try {
    await apiCall('/reset-password/request', { email });
    return { error: null };
  } catch (err) {
    return { error: err as AuthError };
  }
}

export async function confirmResetPassword(
  token: string,
  password: string
): Promise<{ error: AuthError | null }> {
  try {
    await apiCall('/reset-password/confirm', { token, password });
    return { error: null };
  } catch (err) {
    return { error: err as AuthError };
  }
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ error: AuthError | null }> {
  if (!currentSession?.accessToken) {
    return { error: { message: 'Not authenticated' } };
  }

  try {
    await apiCall(
      '/change-password',
      { currentPassword, newPassword },
      {
        accessToken: currentSession.accessToken,
      }
    );
    // Password changed -- session will be invalidated server-side
    // Clear local session to force re-login
    currentSession = null;
    if (refreshTimer) clearTimeout(refreshTimer);
    emit('SIGNED_OUT', null);
    return { error: null };
  } catch (err) {
    return { error: { message: (err as AuthError).message } };
  }
}
