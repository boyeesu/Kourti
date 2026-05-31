/**
 * Consent ledger + marketing-preference service (GDPR Art. 7, NDPR 2.3).
 *
 * Every grant/withdrawal is appended to `public.consent_records` so we can
 * demonstrate when and how consent was given. Quick-access columns on
 * `profiles` / `client_users` / `contact_submissions` mirror the latest state
 * for cheap reads, but the ledger is the source of truth.
 *
 * Marketing emails MUST carry a one-click unsubscribe link. The link uses a
 * stateless HMAC token (no DB lookup needed to validate) so it survives even
 * if the contact record is gone. See `unsubscribeToken` / `verifyUnsubscribeToken`.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

import { env } from '../config/env.js';
import { db } from '../db/pool.js';

export type SubjectType = 'user' | 'client_user' | 'lead';
export type ConsentType = 'terms' | 'privacy' | 'marketing' | 'cookies' | 'dpa';

export interface ConsentInput {
  subjectType: SubjectType;
  subjectId?: string | null;
  email?: string | null;
  consentType: ConsentType;
  granted: boolean;
  version?: string | null;
  source?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/** Pull IP + user-agent off a request for consent provenance. */
export function consentContext(req: Request): { ip: string | null; userAgent: string | null } {
  const ip = (req.ip || req.socket?.remoteAddress || '').toString() || null;
  const ua = req.get('user-agent') || null;
  return { ip, userAgent: ua };
}

/** Append a consent event to the ledger. Never throws into the request path. */
export async function recordConsent(input: ConsentInput): Promise<void> {
  try {
    await db.query(
      `insert into public.consent_records
         (subject_type, subject_id, email, consent_type, granted, version, source, ip_address, user_agent)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        input.subjectType,
        input.subjectId ?? null,
        input.email ? input.email.trim().toLowerCase() : null,
        input.consentType,
        input.granted,
        input.version ?? null,
        input.source ?? null,
        input.ip ?? null,
        input.userAgent ?? null,
      ]
    );
  } catch (err) {
    console.error('[consent] failed to record:', err instanceof Error ? err.message : err);
  }
}

/**
 * Record terms + privacy acceptance for a staff user and mirror onto the
 * profile. Call from onboarding/signup with the accepted version string.
 */
export async function acceptTermsForUser(params: {
  userId: string;
  email?: string | null;
  version: string;
  ip?: string | null;
  userAgent?: string | null;
  source?: string;
}): Promise<void> {
  const { userId, email, version, ip, userAgent, source = 'onboarding' } = params;
  await Promise.all([
    recordConsent({
      subjectType: 'user',
      subjectId: userId,
      email,
      consentType: 'terms',
      granted: true,
      version,
      source,
      ip,
      userAgent,
    }),
    recordConsent({
      subjectType: 'user',
      subjectId: userId,
      email,
      consentType: 'privacy',
      granted: true,
      version,
      source,
      ip,
      userAgent,
    }),
  ]);
  await db
    .query(
      `update public.profiles
          set terms_accepted_at = now(), terms_version = $2, updated_at = now()
        where user_id = $1`,
      [userId, version]
    )
    .catch((err) => console.error('[consent] terms mirror failed:', err));
}

/** Set (and mirror) a staff user's marketing-email preference. */
export async function setUserMarketingConsent(params: {
  userId: string;
  email?: string | null;
  granted: boolean;
  ip?: string | null;
  userAgent?: string | null;
  source?: string;
}): Promise<void> {
  const { userId, email, granted, ip, userAgent, source = 'preferences' } = params;
  await recordConsent({
    subjectType: 'user',
    subjectId: userId,
    email,
    consentType: 'marketing',
    granted,
    source,
    ip,
    userAgent,
  });
  await db
    .query(
      `update public.profiles
          set marketing_consent = $2,
              marketing_consent_at = case when $2 then now() else marketing_consent_at end,
              updated_at = now()
        where user_id = $1`,
      [userId, granted]
    )
    .catch((err) => console.error('[consent] marketing mirror failed:', err));
}

/** Whether a staff user currently consents to marketing email. */
export async function userHasMarketingConsent(userId: string): Promise<boolean> {
  const res = await db.query<{ marketing_consent: boolean }>(
    'select marketing_consent from public.profiles where user_id = $1 limit 1',
    [userId]
  );
  return res.rows[0]?.marketing_consent === true;
}

// ── Stateless unsubscribe token ───────────────────────────────────────────
// HMAC(email) — lets an unsubscribe link work without storing per-link state
// and without exposing the raw email in a way that can be tampered with.

function unsubSecret(): string {
  // Prefer a dedicated unsubscribe HMAC key (segregated from JWT_SECRET to
  // limit blast radius on a leak); fall back to JWT_SECRET so unsubscribe links
  // already sent before UNSUBSCRIBE_HMAC_SECRET was introduced keep verifying.
  // Falls back to a constant only in dev where neither is set.
  return env.UNSUBSCRIBE_HMAC_SECRET || env.JWT_SECRET || 'kourti-dev-unsub-key';
}

export function unsubscribeToken(email: string): string {
  return createHmac('sha256', unsubSecret()).update(email.trim().toLowerCase()).digest('base64url');
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  const expected = unsubscribeToken(email);
  const a = Buffer.from(expected);
  const b = Buffer.from(token || '');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Build a one-click unsubscribe URL for marketing emails. */
export function unsubscribeUrl(email: string): string {
  const base = (env.PUBLIC_BASE_URL || env.APP_URL || '').replace(/\/$/, '');
  const e = encodeURIComponent(email.trim().toLowerCase());
  const t = unsubscribeToken(email);
  return `${base}/api/v1/public/unsubscribe?email=${e}&token=${t}`;
}

/**
 * Apply an unsubscribe across every place we track marketing consent for an
 * email: profiles, client_users, contact_submissions, plus the ledger.
 * Returns true if the token was valid.
 */
export async function applyUnsubscribe(email: string, token: string): Promise<boolean> {
  if (!verifyUnsubscribeToken(email, token)) return false;
  const clean = email.trim().toLowerCase();

  await recordConsent({
    subjectType: 'lead',
    email: clean,
    consentType: 'marketing',
    granted: false,
    source: 'unsubscribe_link',
  });

  await Promise.all([
    db.query(
      `update public.profiles set marketing_consent = false, updated_at = now() where lower(email) = $1`,
      [clean]
    ),
    db.query(
      `update public.client_users set marketing_consent = false, updated_at = now() where lower(email) = $1`,
      [clean]
    ),
    db.query(
      `update public.contact_submissions set marketing_consent = false, unsubscribed_at = now() where lower(email) = $1`,
      [clean]
    ),
  ]).catch((err) => console.error('[consent] unsubscribe apply failed:', err));

  // Best-effort: remove from Brevo marketing lists.
  try {
    const { brevoRemoveFromMarketing } = await import('./brevo.js');
    await brevoRemoveFromMarketing(clean).catch(() => undefined);
  } catch {
    /* brevo optional */
  }
  return true;
}
