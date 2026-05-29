/**
 * Paystack integration. One-shot hosted-checkout flow:
 *
 *   1. Backend calls /transaction/initialize → returns authorization_url +
 *      a Paystack reference. We persist a pending row in payment_transactions
 *      keyed by our own tx_ref (which we also pass as Paystack `reference`
 *      so the two sides line up).
 *   2. User completes payment on Paystack's hosted page.
 *   3. We trust one of two signals to flip the row to successful and bump
 *      the subscription window:
 *        - Webhook (POST /webhooks/paystack) — signed, server-to-server,
 *          authoritative.
 *        - User-driven verify (POST /misc/subscriptions/verify-payment) —
 *          frontend retries this on the redirect callback in case the webhook
 *          is delayed.
 *      Both paths are idempotent: activation runs at most once per tx_ref.
 *
 * We deliberately do NOT use Paystack's Plans/Subscriptions API. The user
 * asked for "payment collection only — we handle subscriptions on our own
 * backend." So all renewal/cancel/state transitions are owned here.
 */
import crypto from 'node:crypto';

import { env } from '../config/env.js';
import { ApiError } from '../lib/http.js';

const PAYSTACK_BASE = 'https://api.paystack.co';

function secretKey(): string {
  if (!env.PAYSTACK_SECRET_KEY) {
    throw new ApiError(
      'Payments are not configured on this environment.',
      503,
      'PAYSTACK_NOT_CONFIGURED'
    );
  }
  return env.PAYSTACK_SECRET_KEY;
}

export function isPaystackConfigured(): boolean {
  return Boolean(env.PAYSTACK_SECRET_KEY);
}

interface InitializeArgs {
  email: string;
  /** Amount in major units (e.g. naira). Paystack wants kobo; we convert here. */
  amount: number;
  currency?: string;
  /** Our reference. Becomes Paystack `reference` so both sides agree. */
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}

interface InitializeResponse {
  authorization_url: string;
  access_code: string;
  reference: string;
}

/**
 * Create a hosted checkout link.
 *
 * Paystack expects `amount` in the lowest currency unit (kobo for NGN, cents
 * for USD). We round to avoid floating-point drift.
 */
export async function initializeTransaction(args: InitializeArgs): Promise<InitializeResponse> {
  const body = {
    email: args.email,
    amount: Math.round(args.amount * 100),
    currency: args.currency ?? env.PAYSTACK_CURRENCY,
    reference: args.reference,
    callback_url: args.callbackUrl,
    metadata: args.metadata ?? {},
  };

  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => null)) as {
    status: boolean;
    message?: string;
    data?: InitializeResponse;
  } | null;

  if (!res.ok || !json?.status || !json.data?.authorization_url) {
    // Keep Paystack's message in logs (it can include account hints we
    // don't want exposed); surface a generic one to callers.
     
    console.warn('[paystack] initialize failed', {
      status: res.status,
      message: json?.message,
    });
    throw new ApiError(
      'Could not start checkout. Please try again.',
      502,
      'PAYSTACK_INITIALIZE_FAILED'
    );
  }

  return json.data;
}

export interface PaystackVerifyResult {
  /** Paystack-internal numeric id, only present once the tx exists. */
  id: number | null;
  reference: string;
  /** 'success' | 'failed' | 'abandoned' | 'pending' | etc. */
  status: string;
  amount: number;
  currency: string;
  customer_email: string | null;
  paid_at: string | null;
  /** Full Paystack response, persisted for audit. */
  raw: unknown;
}

/**
 * Verify a transaction by reference. This is the authoritative state read
 * — we re-verify even when the webhook fires, in case the webhook payload
 * was spoofed despite signature checking (defence in depth).
 */
export async function verifyTransaction(reference: string): Promise<PaystackVerifyResult> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
  });

  const json = (await res.json().catch(() => null)) as {
    status: boolean;
    message?: string;
    data?: Record<string, unknown>;
  } | null;

  if (!res.ok || !json?.status || !json.data) {
     
    console.warn('[paystack] verify failed', {
      status: res.status,
      message: json?.message,
      reference,
    });
    throw new ApiError('Payment verification failed.', 502, 'PAYSTACK_VERIFY_FAILED');
  }

  const d = json.data;
  return {
    id: typeof d.id === 'number' ? d.id : null,
    reference: String(d.reference),
    status: String(d.status),
    amount: typeof d.amount === 'number' ? d.amount / 100 : 0,
    currency: String(d.currency ?? env.PAYSTACK_CURRENCY),
    customer_email: (d.customer as { email?: string } | undefined)?.email ?? null,
    paid_at: typeof d.paid_at === 'string' ? d.paid_at : null,
    raw: d,
  };
}

/**
 * Verify the Paystack webhook signature. Paystack signs the raw request
 * body with HMAC-SHA512 using the secret key and puts the hex digest in
 * `x-paystack-signature`. We MUST hash the raw body (not the parsed JSON),
 * so the route mounts `express.raw({ type: '*\/*' })` for this path.
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined
): boolean {
  if (!signatureHeader || !env.PAYSTACK_SECRET_KEY) return false;
  const expected = crypto
    .createHmac('sha512', env.PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest('hex');
  // Length check first — timingSafeEqual throws on unequal buffer lengths.
  if (expected.length !== signatureHeader.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

/**
 * Build a tx_ref that is unique, URL-safe, and easy to recognise in logs.
 * Format: `kourti_<unix-ms>_<32 hex>` — 128 bits of entropy in the random
 * suffix so the verify route can't be probed by enumeration. Paystack
 * accepts up to 100 chars; we use 56.
 */
export function generateTxRef(): string {
  return `kourti_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;
}
