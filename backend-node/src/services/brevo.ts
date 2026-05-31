/**
 * Brevo (Sendinblue) contact sync — marketing layer.
 *
 * Resend stays the transactional sender (auth, receipts, system notifications).
 * Brevo is just a mirror of users-as-contacts so marketing can build
 * segments and campaigns from the Brevo UI. Attributes are the source of
 * truth for segmentation; lists are optional explicit buckets.
 *
 * Attribute model:
 *  - PLAN       — mirrors `public.user_plans.name` exactly ("free"|"starter"
 *                 |"professional"|"enterprise") or empty if no subscription.
 *                 Never holds a synthetic lifecycle value.
 *  - SUB_STATUS — mirrors `public.subscriptions.status` ("trialing"|"active"
 *                 |"past_due"|"cancelled") plus "expired" (set by our trial
 *                 expiry sweep) and "none" (no subscription yet). This is the
 *                 lifecycle dimension to segment on.
 *  - TRIAL_ENDS_AT, SIGNUP_DATE — ISO dates.
 *
 * All calls are fire-and-forget — Brevo outages must never break signup or
 * billing. Use `brevoSync*(...).catch(logBrevoError)` at call sites.
 */
import { logEmailDelivery } from './emailLog.js';

const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const BREVO_BASE = 'https://api.brevo.com/v3';

const LIST_ID_SIGNUPS = parseListId(process.env.BREVO_LIST_ID_SIGNUPS);
const LIST_ID_TRIAL_ACTIVE = parseListId(process.env.BREVO_LIST_ID_TRIAL_ACTIVE);
const LIST_ID_TRIAL_EXPIRED = parseListId(process.env.BREVO_LIST_ID_TRIAL_EXPIRED);
const LIST_ID_PAID = parseListId(process.env.BREVO_LIST_ID_PAID);
const LIST_ID_PAST_DUE = parseListId(process.env.BREVO_LIST_ID_PAST_DUE);
// Marketing-site leads (contact form / maturity assessment) — pre-signup.
const LIST_ID_LEADS = parseListId(process.env.BREVO_LIST_ID_LEADS);

function parseListId(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type SubStatus = 'none' | 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired';

export interface BrevoContactAttributes {
  FIRSTNAME?: string | null;
  LASTNAME?: string | null;
  FIRM_NAME?: string | null;
  PLAN?: string | null;
  SUB_STATUS?: SubStatus;
  TRIAL_ENDS_AT?: string | null;
  SIGNUP_DATE?: string | null;
  LAST_LOGIN?: string | null;
  ORGANIZATION_ID?: string | null;
  USER_ID?: string | null;
}

interface UpsertOptions {
  listIds?: number[];
  unlinkListIds?: number[];
}

function isConfigured(): boolean {
  return BREVO_API_KEY.length > 0;
}

async function brevoFetch(
  path: string,
  init: { method: string; body?: unknown }
): Promise<Response> {
  return fetch(`${BREVO_BASE}${path}`, {
    method: init.method,
    headers: {
      'api-key': BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: init.body == null ? undefined : JSON.stringify(init.body),
  });
}

/**
 * Create-or-update a contact by email. 201 on create, 204 on update.
 * Null/empty attributes are stripped so we don't blank fields Brevo already has.
 */
export async function brevoUpsertContact(
  email: string,
  attributes: BrevoContactAttributes,
  options: UpsertOptions = {}
): Promise<void> {
  if (!isConfigured()) return;
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return;

  const attrs: Record<string, string> = {};
  for (const [k, v] of Object.entries(attributes)) {
    if (v != null && v !== '') attrs[k] = String(v);
  }

  const body: Record<string, unknown> = {
    email: cleanEmail,
    attributes: attrs,
    updateEnabled: true,
  };
  if (options.listIds && options.listIds.length > 0) body.listIds = options.listIds;
  if (options.unlinkListIds && options.unlinkListIds.length > 0) {
    body.unlinkListIds = options.unlinkListIds;
  }

  let res: Response;
  try {
    res = await brevoFetch('/contacts', { method: 'POST', body });
  } catch (err) {
    void logEmailDelivery({
      provider: 'brevo',
      toEmail: cleanEmail,
      template: 'contact_sync',
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
      organizationId: attrs.ORGANIZATION_ID ?? null,
      userId: attrs.USER_ID ?? null,
      metadata: { sub_status: attrs.SUB_STATUS ?? null },
    });
    throw err;
  }

  if (!res.ok && res.status !== 204) {
    const text = await safeText(res);
    void logEmailDelivery({
      provider: 'brevo',
      toEmail: cleanEmail,
      template: 'contact_sync',
      status: 'failed',
      error: `brevo upsert failed: ${res.status} ${text}`,
      organizationId: attrs.ORGANIZATION_ID ?? null,
      userId: attrs.USER_ID ?? null,
      metadata: { sub_status: attrs.SUB_STATUS ?? null },
    });
    throw new Error(`brevo upsert failed: ${res.status} ${text}`);
  }

  void logEmailDelivery({
    provider: 'brevo',
    toEmail: cleanEmail,
    template: 'contact_sync',
    status: 'sent',
    organizationId: attrs.ORGANIZATION_ID ?? null,
    userId: attrs.USER_ID ?? null,
    metadata: { sub_status: attrs.SUB_STATUS ?? null },
  });
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function toIsoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Lists to unlink whenever a contact moves to a new lifecycle state. */
function allLifecycleLists(): number[] {
  return [LIST_ID_TRIAL_ACTIVE, LIST_ID_TRIAL_EXPIRED, LIST_ID_PAID, LIST_ID_PAST_DUE].filter(
    (x): x is number => x != null
  );
}

function lifecycleListsExcept(keep: number | null): number[] {
  return allLifecycleLists().filter((id) => id !== keep);
}

/** Brand-new signup, no subscription yet. */
export function brevoSyncSignup(
  email: string,
  metadata: { firstName?: string | null; lastName?: string | null; userId?: string | null }
): Promise<void> {
  return brevoUpsertContact(
    email,
    {
      FIRSTNAME: metadata.firstName ?? null,
      LASTNAME: metadata.lastName ?? null,
      USER_ID: metadata.userId ?? null,
      SIGNUP_DATE: toIsoDate(new Date()),
      SUB_STATUS: 'none',
    },
    LIST_ID_SIGNUPS ? { listIds: [LIST_ID_SIGNUPS] } : {}
  );
}

/** Trial started — subscription row inserted with status='trialing'. */
export function brevoSyncTrialStart(
  email: string,
  metadata: {
    firstName?: string | null;
    lastName?: string | null;
    organizationId?: string | null;
    userId?: string | null;
    firmName?: string | null;
    trialEndsAt: Date | string | null;
    plan: string | null;
  }
): Promise<void> {
  return brevoUpsertContact(
    email,
    {
      FIRSTNAME: metadata.firstName ?? null,
      LASTNAME: metadata.lastName ?? null,
      FIRM_NAME: metadata.firmName ?? null,
      ORGANIZATION_ID: metadata.organizationId ?? null,
      USER_ID: metadata.userId ?? null,
      PLAN: metadata.plan,
      SUB_STATUS: 'trialing',
      TRIAL_ENDS_AT: toIsoDate(metadata.trialEndsAt),
    },
    {
      listIds: LIST_ID_TRIAL_ACTIVE ? [LIST_ID_TRIAL_ACTIVE] : [],
      unlinkListIds: lifecycleListsExcept(LIST_ID_TRIAL_ACTIVE),
    }
  );
}

/** Trial expired without conversion. */
export function brevoSyncTrialExpired(email: string): Promise<void> {
  return brevoUpsertContact(
    email,
    { SUB_STATUS: 'expired' },
    {
      listIds: LIST_ID_TRIAL_EXPIRED ? [LIST_ID_TRIAL_EXPIRED] : [],
      unlinkListIds: lifecycleListsExcept(LIST_ID_TRIAL_EXPIRED),
    }
  );
}

/** Trial → paid (or direct subscribe). */
export function brevoSyncConverted(email: string, plan: string): Promise<void> {
  return brevoUpsertContact(
    email,
    { PLAN: plan, SUB_STATUS: 'active' },
    {
      listIds: LIST_ID_PAID ? [LIST_ID_PAID] : [],
      unlinkListIds: lifecycleListsExcept(LIST_ID_PAID),
    }
  );
}

/** Payment failed — card needs fixing before cancellation. */
export function brevoSyncPastDue(email: string): Promise<void> {
  return brevoUpsertContact(
    email,
    { SUB_STATUS: 'past_due' },
    {
      listIds: LIST_ID_PAST_DUE ? [LIST_ID_PAST_DUE] : [],
      unlinkListIds: lifecycleListsExcept(LIST_ID_PAST_DUE),
    }
  );
}

/** Subscription cancelled. */
export function brevoSyncCancelled(email: string): Promise<void> {
  return brevoUpsertContact(
    email,
    { SUB_STATUS: 'cancelled' },
    { unlinkListIds: allLifecycleLists() }
  );
}

/**
 * Marketing-site lead (contact form / maturity assessment) — captured before
 * any signup. No PLAN/SUB_STATUS (they aren't a customer yet); just identity +
 * firm so sales can follow up and marketing can segment. Added to the leads
 * list when configured. Fire-and-forget like the rest — never block the form.
 */
export function brevoSyncMarketingLead(
  email: string,
  metadata: {
    firstName?: string | null;
    lastName?: string | null;
    firmName?: string | null;
  } = {}
): Promise<void> {
  return brevoUpsertContact(
    email,
    {
      FIRSTNAME: metadata.firstName ?? null,
      LASTNAME: metadata.lastName ?? null,
      FIRM_NAME: metadata.firmName ?? null,
    },
    { listIds: LIST_ID_LEADS ? [LIST_ID_LEADS] : [] }
  );
}

/**
 * Unsubscribe a contact from marketing (GDPR Art. 21 objection / opt-out).
 * Blacklists the email in Brevo so no campaign can reach it, but keeps the
 * record for suppression purposes. Idempotent and fire-and-forget safe.
 */
export async function brevoRemoveFromMarketing(email: string): Promise<void> {
  if (!isConfigured()) return;
  const clean = email.trim().toLowerCase();
  if (!clean) return;
  const res = await brevoFetch(`/contacts/${encodeURIComponent(clean)}`, {
    method: 'PUT',
    body: {
      emailBlacklisted: true,
      unlinkListIds: allLifecycleLists().concat(LIST_ID_LEADS ?? []),
    },
  });
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    throw new Error(`brevo blacklist failed: ${res.status} ${await safeText(res)}`);
  }
}

/**
 * Hard-delete a contact from Brevo (right to erasure, Art. 17). 404 is fine —
 * the contact may never have been synced.
 */
export async function brevoDeleteContact(email: string): Promise<void> {
  if (!isConfigured()) return;
  const clean = email.trim().toLowerCase();
  if (!clean) return;
  const res = await brevoFetch(`/contacts/${encodeURIComponent(clean)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    throw new Error(`brevo delete failed: ${res.status} ${await safeText(res)}`);
  }
}

export function logBrevoError(err: unknown): void {
  console.error('[brevo] sync failed:', err instanceof Error ? err.message : err);
}
