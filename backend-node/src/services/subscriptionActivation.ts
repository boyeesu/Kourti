/**
 * Subscription activation logic shared by the Paystack webhook and the
 * user-driven verify-payment route. Both paths converge here so we have
 * exactly one place that mutates subscription state in response to a
 * successful charge.
 *
 * Idempotency contract: calling `activateSubscriptionFromTx(txRef, …)`
 * twice with the same successful Paystack data produces the same final
 * state and only one billing-period bump.
 */
import { db } from '../db/pool.js';
import type { PaystackVerifyResult } from './paystack.js';

/**
 * Drop Paystack's full raw payload before persisting. Verify can return
 * log arrays, fee breakdowns, and customer history that grow the DB
 * unbounded without buying us anything. Keep audit-relevant fields only.
 */
function slimRaw(p: PaystackVerifyResult): Record<string, unknown> {
  return {
    id: p.id,
    reference: p.reference,
    status: p.status,
    amount: p.amount,
    currency: p.currency,
    customer_email: p.customer_email,
    paid_at: p.paid_at,
  };
}

/**
 * 1 kobo / 1 cent of float-comparison slack when reconciling what we
 * charged against what Paystack reports was paid.
 */
const AMOUNT_TOLERANCE_MAJOR = 0.01;

interface PaymentTxRow {
  id: string;
  organization_id: string;
  user_id: string | null;
  plan_id: string | null;
  billing_interval: string | null;
  amount: number | string;
  currency: string;
  status: string;
  customer_email: string | null;
  metadata: Record<string, unknown> | null;
}

export interface ActivationResult {
  status: 'activated' | 'already_processed' | 'failed' | 'pending' | 'not_found';
  subscription_id: string | null;
  subscription_status: string | null;
  message?: string;
}

/**
 * Look up our pending payment_transaction row by tx_ref, reconcile it with
 * Paystack's verified data, and (on success) flip the org subscription to
 * active. Safe to call from a webhook handler and from a user-clicks-verify
 * endpoint — the row's `status` is the idempotency key.
 */
export async function activateSubscriptionFromTx(
  txRef: string,
  paystack: PaystackVerifyResult,
  source: 'webhook' | 'verify'
): Promise<ActivationResult> {
  const txRes = await db.query<PaymentTxRow>(
    `select id, organization_id, user_id, plan_id, billing_interval,
            amount, currency, status, customer_email, metadata
       from public.payment_transactions
      where tx_ref = $1
      limit 1`,
    [txRef]
  );
  const tx = txRes.rows[0];
  if (!tx) {
    return {
      status: 'not_found',
      subscription_id: null,
      subscription_status: null,
      message: 'Transaction not found',
    };
  }

  // Paystack-side state machine. Anything that isn't "success" we record
  // but do NOT activate. Webhook can re-arrive with an updated status, but
  // once we've activated, we don't downgrade off this row.
  const isSuccess = paystack.status === 'success';
  const isFailure = ['failed', 'abandoned', 'reversed'].includes(paystack.status);

  // Stamp the row regardless — we want the raw response for audit even if
  // the charge ultimately failed.
  const stampField = source === 'webhook' ? 'webhook_received_at' : 'verified_at';

  if (tx.status === 'successful') {
    // Already activated. Just refresh audit timestamps; do NOT bump the
    // subscription window a second time.
    await db.query(
      `update public.payment_transactions
          set ${stampField} = now(),
              provider_tx_id = coalesce(provider_tx_id, $2),
              raw_response = coalesce(raw_response, $3::jsonb),
              updated_at = now()
        where id = $1`,
      [tx.id, paystack.id ? String(paystack.id) : null, JSON.stringify(slimRaw(paystack))]
    );
    return {
      status: 'already_processed',
      subscription_id: null,
      subscription_status: 'active',
    };
  }

  if (!isSuccess) {
    const newStatus = isFailure ? 'failed' : 'pending';
    await db.query(
      `update public.payment_transactions
          set status = $2,
              ${stampField} = now(),
              provider_tx_id = coalesce($3, provider_tx_id),
              raw_response = $4::jsonb,
              updated_at = now()
        where id = $1`,
      [
        tx.id,
        newStatus,
        paystack.id ? String(paystack.id) : null,
        JSON.stringify(slimRaw(paystack)),
      ]
    );
    return {
      status: isFailure ? 'failed' : 'pending',
      subscription_id: null,
      subscription_status: null,
      message: `Paystack status: ${paystack.status}`,
    };
  }

  // Reconcile what Paystack says was paid against what we charged.
  // Even with hosted checkout this guards against PSP-side discounts,
  // partial captures, currency mis-config, and (worst case) a spoofed
  // webhook that survived the HMAC check via a leaked secret. We charge
  // in PAYSTACK_CURRENCY (NGN), so `tx.amount` / `tx.currency` are the
  // ground truth — `display_*` columns are just for receipts.
  const expectedAmount = Number(tx.amount);
  const paidAmount = paystack.amount;
  const amountOk =
    Number.isFinite(paidAmount) &&
    Number.isFinite(expectedAmount) &&
    Math.abs(paidAmount - expectedAmount) <= AMOUNT_TOLERANCE_MAJOR;
  const currencyOk = paystack.currency.toUpperCase() === tx.currency.toUpperCase();

  if (!amountOk || !currencyOk) {
    console.warn('[paystack] activation refused — amount/currency mismatch', {
      tx_ref: txRef,
      expected: `${expectedAmount} ${tx.currency}`,
      paid: `${paidAmount} ${paystack.currency}`,
    });
    await db.query(
      `update public.payment_transactions
          set status = 'failed',
              ${stampField} = now(),
              provider_tx_id = coalesce($2, provider_tx_id),
              raw_response = $3::jsonb,
              updated_at = now()
        where id = $1`,
      [tx.id, paystack.id ? String(paystack.id) : null, JSON.stringify(slimRaw(paystack))]
    );
    return {
      status: 'failed',
      subscription_id: null,
      subscription_status: null,
      message: 'Paid amount or currency did not match the expected charge.',
    };
  }

  // Successful charge → activate. Single transaction so the tx row and
  // the subscription row commit together.
  const client = await db.connect();
  try {
    await client.query('begin');

    const periodDays = tx.billing_interval === 'yearly' ? 365 : 30;

    // Upsert into subscriptions. The unique partial index uq_subscriptions_org_live
    // enforces one live sub per org — if one exists we update it in place
    // (upgrade / renewal); otherwise we insert.
    const existing = await client.query<{ id: string }>(
      `select id from public.subscriptions
        where organization_id = $1
          and status in ('active','trialing','past_due')
        order by created_at desc
        limit 1`,
      [tx.organization_id]
    );

    let subscriptionId: string;
    if (existing.rows[0]) {
      subscriptionId = existing.rows[0].id;
      await client.query(
        `update public.subscriptions
            set plan_id = coalesce($2, plan_id),
                status = 'active',
                billing_interval = coalesce($3, billing_interval),
                current_period_start = now(),
                current_period_end = now() + make_interval(days => $4::int),
                cancel_at_period_end = false,
                cancelled_at = null,
                provider = 'paystack',
                provider_customer_email = coalesce($5, provider_customer_email),
                provider_reference = $6,
                updated_at = now()
          where id = $1`,
        [
          subscriptionId,
          tx.plan_id,
          tx.billing_interval,
          periodDays,
          paystack.customer_email ?? tx.customer_email,
          txRef,
        ]
      );
    } else {
      const ins = await client.query<{ id: string }>(
        `insert into public.subscriptions
           (organization_id, user_id, plan_id, status, billing_interval,
            current_period_start, current_period_end,
            provider, provider_customer_email, provider_reference,
            created_at, updated_at)
         values ($1, $2, $3, 'active', $4,
                 now(), now() + make_interval(days => $5::int),
                 'paystack', $6, $7,
                 now(), now())
         returning id`,
        [
          tx.organization_id,
          tx.user_id,
          tx.plan_id,
          tx.billing_interval ?? 'monthly',
          periodDays,
          paystack.customer_email ?? tx.customer_email,
          txRef,
        ]
      );
      subscriptionId = ins.rows[0].id;
    }

    await client.query(
      `update public.payment_transactions
          set status = 'successful',
              subscription_id = $2,
              ${stampField} = now(),
              provider_tx_id = $3,
              customer_email = coalesce($4, customer_email),
              raw_response = $5::jsonb,
              updated_at = now()
        where id = $1`,
      [
        tx.id,
        subscriptionId,
        paystack.id ? String(paystack.id) : null,
        paystack.customer_email,
        JSON.stringify(slimRaw(paystack)),
      ]
    );

    await client.query('commit');
    return {
      status: 'activated',
      subscription_id: subscriptionId,
      subscription_status: 'active',
    };
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
