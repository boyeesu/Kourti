/**
 * Client Portal API client.
 *
 * A separate auth surface from the staff app. Tokens are stored in localStorage
 * under `kourti_portal_tokens` (distinct from the staff token store). Mirrors the
 * conventions in `lib/api.ts` / `lib/backendApi.ts` but for the `/api/v1/portal*`
 * endpoints with portal-specific bearer + refresh handling.
 */
import { env } from '@/lib/env';

// ── Token storage ─────────────────────────────────────────────────────────────

export const PORTAL_TOKEN_KEY = 'kourti_portal_tokens';

export interface PortalTokens {
  accessToken: string;
  refreshToken: string;
  /** epoch ms at which the access token expires */
  expiresAt: number;
}

export function getPortalTokens(): PortalTokens | null {
  try {
    const raw = localStorage.getItem(PORTAL_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PortalTokens;
    if (!parsed?.accessToken || !parsed?.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setPortalTokens(input: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}): void {
  const tokens: PortalTokens = {
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    expiresAt: Date.now() + input.expiresIn * 1000,
  };
  localStorage.setItem(PORTAL_TOKEN_KEY, JSON.stringify(tokens));
}

export function clearPortalTokens(): void {
  localStorage.removeItem(PORTAL_TOKEN_KEY);
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface PortalAuthUser {
  id: string;
  email: string;
  fullName: string | null;
}

export interface PortalAuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: PortalAuthUser;
}

/** Tokens variant of the login union. */
export interface PortalLoginTokens extends PortalAuthResponse {
  kind: 'tokens';
}

/** OTP-required variant of the login union. */
export interface PortalLoginOtpRequired {
  kind: 'otp_required';
  otpToken: string;
  otpTokenExpiresIn: number;
  emailHint: string;
}

export type PortalLoginResult = PortalLoginTokens | PortalLoginOtpRequired;

export interface PortalResendOtpResponse {
  otpTokenExpiresIn: number;
  emailHint: string;
}

export interface PortalFirm {
  organizationId: string;
  name: string;
  logoUrl: string | null;
}

export interface PortalMatterSummary {
  caseId: string;
  title: string;
  clientSummary: string | null;
  status: string | null;
  firm: PortalFirm;
  lastEventAt: string | null;
  unreadMessages: number;
}

export interface PortalMatterDetail {
  caseId: string;
  title: string;
  clientSummary: string | null;
  status: string | null;
  nextHearingDate: string | null;
  firm: PortalFirm;
}

export type PortalEventType =
  | 'case_created'
  | 'status_changed'
  | 'hearing_scheduled'
  | 'document_shared'
  | 'document_added'
  | 'task_completed'
  | 'note_added'
  | 'client_message'
  | 'invoice_sent'
  | 'invoice_paid'
  | 'update_sent'
  | (string & {});

export interface PortalTimelineEvent {
  id: string;
  eventType: PortalEventType;
  title: string | null;
  body: string | null;
  occurredAt: string;
}

export interface PortalDocument {
  id: string;
  name: string;
  downloadUrl: string | null;
}

export interface PortalMessage {
  id: string;
  senderType: 'staff' | 'client';
  body: string;
  createdAt: string;
}

export interface PortalTeamMember {
  clientUserId: string;
  email: string;
  fullName: string | null;
  pending: boolean;
  invitedByMe: boolean;
}

export type PortalRsvpResponse = 'accepted' | 'declined' | 'tentative';

export interface PortalCalendarEvent {
  id: string;
  title: string | null;
  description: string | null;
  start_date: string;
  end_date: string | null;
  location: string | null;
  event_type: string | null;
  rsvp: PortalRsvpResponse | null;
}

export interface PortalCalendarEventWithMatter extends PortalCalendarEvent {
  caseId: string;
  matterTitle: string;
  firm: PortalFirm;
}

// ── Errors ────────────────────────────────────────────────────────────────────

export class PortalApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'PortalApiError';
    this.status = status;
    this.code = code;
  }
}

// ── Internals ─────────────────────────────────────────────────────────────────

function portalUrl(path: string): string {
  return `${env.BACKEND_API_URL}/api/v1/portal${path}`;
}

/**
 * Low-level call against an UNAUTHENTICATED portal auth endpoint
 * (`/api/v1/portal/auth/*`). No bearer attached.
 */
async function authCall<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.API_TIMEOUT);

  const res = await fetch(portalUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  const data = (await res.json().catch(() => null)) as
    | ({ error?: string; message?: string; errorCode?: string } & Record<string, unknown>)
    | null;

  if (!res.ok) {
    throw new PortalApiError(
      (data?.error as string) ||
        (data?.message as string) ||
        `Portal request failed (${res.status})`,
      res.status,
      data?.errorCode as string | undefined
    );
  }
  return data as unknown as T;
}

let refreshInFlight: Promise<PortalTokens> | null = null;

/** Refresh the portal access token using the stored refresh token. */
async function refreshPortalSession(): Promise<PortalTokens> {
  if (refreshInFlight) return refreshInFlight;

  const tokens = getPortalTokens();
  if (!tokens?.refreshToken) {
    throw new PortalApiError('Session expired. Please sign in again.', 401);
  }

  refreshInFlight = (async () => {
    try {
      const data = await authCall<PortalAuthResponse>('/auth/refresh', {
        refreshToken: tokens.refreshToken,
      });
      setPortalTokens(data);
      return getPortalTokens()!;
    } catch (err) {
      clearPortalTokens();
      throw err;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/**
 * Authenticated portal request. Attaches the portal bearer; on a 401 it tries a
 * single refresh + retry, then gives up (clearing tokens).
 */
async function portalApi<T>(
  path: string,
  options?: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
  },
  isRetry = false
): Promise<T> {
  const tokens = getPortalTokens();
  if (!tokens?.accessToken) {
    throw new PortalApiError('Not authenticated', 401);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.API_TIMEOUT);

  const res = await fetch(portalUrl(path), {
    method: options?.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokens.accessToken}`,
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  if (res.status === 401 && !isRetry) {
    // Try one refresh + retry.
    await refreshPortalSession();
    return portalApi<T>(path, options, true);
  }

  const data = (await res.json().catch(() => null)) as {
    error?: string;
    message?: string;
    errorCode?: string;
  } | null;

  if (!res.ok) {
    if (res.status === 401) clearPortalTokens();
    throw new PortalApiError(
      data?.error || data?.message || `Portal request failed (${res.status})`,
      res.status,
      data?.errorCode
    );
  }

  return data as unknown as T;
}

// ── Auth endpoints (public) ─────────────────────────────────────────────────

export function portalLogin(email: string, password: string): Promise<PortalLoginResult> {
  return authCall<PortalLoginResult>('/auth/login', { email, password });
}

/** Complete OTP step → returns session tokens. */
export function portalVerifyOtp(otpToken: string, code: string): Promise<PortalAuthResponse> {
  return authCall<PortalAuthResponse>('/auth/verify-otp', { otpToken, code });
}

/** Resend the OTP code; returns a refreshed TTL + masked email hint. */
export function portalResendOtp(otpToken: string): Promise<PortalResendOtpResponse> {
  return authCall<PortalResendOtpResponse>('/auth/resend-otp', { otpToken });
}

export function portalRefresh(refreshToken: string): Promise<PortalAuthResponse> {
  return authCall<PortalAuthResponse>('/auth/refresh', { refreshToken });
}

export function portalAcceptInvite(args: {
  token: string;
  password: string;
  fullName?: string;
}): Promise<PortalAuthResponse> {
  return authCall<PortalAuthResponse>('/auth/accept-invite', args);
}

export function portalForgotPassword(email: string): Promise<{ ok: boolean }> {
  return authCall<{ ok: boolean }>('/auth/forgot-password', { email });
}

export function portalResetPassword(token: string, password: string): Promise<{ ok: boolean }> {
  return authCall<{ ok: boolean }>('/auth/reset-password', { token, password });
}

/** Best-effort server-side sign out using the current bearer. */
export async function portalLogout(): Promise<void> {
  const tokens = getPortalTokens();
  if (!tokens?.accessToken) return;
  try {
    await fetch(portalUrl('/auth/logout'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens.accessToken}`,
      },
    });
  } catch {
    /* best-effort */
  }
}

// ── Authed endpoints ──────────────────────────────────────────────────────────

export function portalGetMe(): Promise<PortalAuthUser> {
  return portalApi<PortalAuthUser>('/me');
}

export function portalGetMatters(): Promise<PortalMatterSummary[]> {
  return portalApi<PortalMatterSummary[]>('/matters');
}

export function portalGetMatter(caseId: string): Promise<PortalMatterDetail> {
  return portalApi<PortalMatterDetail>(`/matters/${caseId}`);
}

export function portalGetTimeline(caseId: string): Promise<PortalTimelineEvent[]> {
  return portalApi<PortalTimelineEvent[]>(`/matters/${caseId}/timeline`);
}

export function portalGetDocuments(caseId: string): Promise<PortalDocument[]> {
  return portalApi<PortalDocument[]>(`/matters/${caseId}/documents`);
}

export function portalGetMessages(caseId: string): Promise<PortalMessage[]> {
  return portalApi<PortalMessage[]>(`/matters/${caseId}/messages`);
}

export function portalPostMessage(caseId: string, body: string): Promise<PortalMessage> {
  return portalApi<PortalMessage>(`/matters/${caseId}/messages`, {
    method: 'POST',
    body: { body },
  });
}

// ── Team ──────────────────────────────────────────────────────────────────────

export function portalGetMatterTeam(caseId: string): Promise<PortalTeamMember[]> {
  return portalApi<PortalTeamMember[]>(`/matters/${caseId}/team`);
}

export function portalInviteTeam(
  caseId: string,
  args: { email: string; fullName?: string }
): Promise<unknown> {
  return portalApi<unknown>(`/matters/${caseId}/team`, {
    method: 'POST',
    body: args,
  });
}

export function portalRemoveTeam(caseId: string, clientUserId: string): Promise<unknown> {
  return portalApi<unknown>(`/matters/${caseId}/team/${clientUserId}`, {
    method: 'DELETE',
  });
}

// ── Calendar ────────────────────────────────────────────────────────────────

export function portalGetMatterCalendar(caseId: string): Promise<PortalCalendarEvent[]> {
  return portalApi<PortalCalendarEvent[]>(`/matters/${caseId}/calendar`);
}

export function portalGetCalendar(): Promise<PortalCalendarEventWithMatter[]> {
  return portalApi<PortalCalendarEventWithMatter[]>('/calendar');
}

/** Record the client's RSVP for a calendar event. */
export function portalRsvpEvent(
  caseId: string,
  eventId: string,
  response: PortalRsvpResponse
): Promise<{ eventId: string; response: PortalRsvpResponse }> {
  return portalApi<{ eventId: string; response: PortalRsvpResponse }>(
    `/matters/${caseId}/calendar/${eventId}/rsvp`,
    { method: 'PUT', body: { response } }
  );
}

// ── .ics generation (pure client-side, no network) ─────────────────────────────

/** Escape a text value per RFC5545 (backslash, semicolon, comma, newline). */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

/** Format a date as UTC `yyyymmddThhmmssZ` per RFC5545. */
function toIcsUtc(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * Build an RFC5545 VCALENDAR/VEVENT string for a portal calendar event.
 * Pure function — performs no network call.
 */
export function buildEventIcs(event: PortalCalendarEvent): string {
  const start = new Date(event.start_date);
  // Default to a 1-hour event when no end date is provided.
  const end = event.end_date
    ? new Date(event.end_date)
    : new Date(start.getTime() + 60 * 60 * 1000);

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kourti Legal//Client Portal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@kourti`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(event.title || 'Event')}`,
  ];

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  }
  if (event.location) {
    lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.join('\r\n');
}

/** Build an .ics blob for the event and trigger a browser download. */
export function downloadIcs(event: PortalCalendarEvent): void {
  const ics = buildEventIcs(event);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const filename = `${(event.title || 'event').replace(/[^\w.-]+/g, '_')}.ics`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
