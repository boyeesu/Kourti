/**
 * Versions of the legal documents users accept at sign-up.
 *
 * Bump these whenever the marketing Terms of Service / Privacy Policy change
 * so the row written to public.terms_acceptances reflects exactly which
 * revision the user agreed to. Format mirrors the "Last Updated" date shown
 * on kourti.com/terms-of-use and kourti.com/privacy-policy (YYYY-MM).
 *
 * These are append-only audit anchors — do NOT mutate a value once it has
 * shipped; introduce a new value instead so historical acceptances stay
 * traceable to the exact document they covered.
 */
export const CURRENT_TERMS_VERSION = '2025-11';
export const CURRENT_PRIVACY_VERSION = '2025-11';

export const TERMS_URL = 'https://kourti.com/terms-of-use';
export const PRIVACY_URL = 'https://kourti.com/privacy-policy';
