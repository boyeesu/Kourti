/**
 * Paystack webhook receiver.
 *
 * Mounted BEFORE the global express.json() so we get the raw body Paystack
 * signed. We HMAC-verify with the secret key (sha512), then re-verify the
 * transaction by reference against Paystack's API as defence-in-depth (a
 * leaked secret can spoof signed bodies; a leaked secret cannot fake the
 * verify endpoint's authoritative state).
 *
 * Always returns 200 once we've recorded an attempt so Paystack doesn't
 * keep retrying — unhandled events are logged and acked.
 */
import express, { Router } from 'express';

import { verifyTransaction, verifyWebhookSignature } from '../../services/paystack.js';
import { activateSubscriptionFromTx } from '../../services/subscriptionActivation.js';

export const paystackWebhookRouter = Router();

paystackWebhookRouter.post(
  '/paystack',
  express.raw({ type: '*/*', limit: '512kb' }),
  async (req, res) => {
    const rawBody = req.body as Buffer;
    const signature = req.header('x-paystack-signature');

    if (!verifyWebhookSignature(rawBody, signature)) {
      // Return 401 to make tampering visible; Paystack will retry but
      // they'll all be rejected, which is desirable.
      res.status(401).json({ ok: false, error: 'invalid_signature' });
      return;
    }

    let payload: { event?: string; data?: { reference?: string } };
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      res.status(400).json({ ok: false, error: 'invalid_json' });
      return;
    }

    const event = payload.event;
    const reference = payload.data?.reference;

    // We only care about charge.success today. Other events (transfer.*,
    // subscription.*) are logged and ignored.
    if (event !== 'charge.success') {
       
      console.log(`[paystack-webhook] ignoring event=${event} reference=${reference ?? 'n/a'}`);
      res.status(200).json({ ok: true, ignored: true });
      return;
    }

    if (!reference) {
      res.status(400).json({ ok: false, error: 'missing_reference' });
      return;
    }

    try {
      const paystack = await verifyTransaction(reference);
      const result = await activateSubscriptionFromTx(reference, paystack, 'webhook');
       
      console.log(
        `[paystack-webhook] reference=${reference} result=${result.status} sub=${result.subscription_id ?? 'n/a'}`
      );
      res.status(200).json({ ok: true, result: result.status });
    } catch (err) {
       
      console.error('[paystack-webhook] processing error', {
        reference,
        message: err instanceof Error ? err.message : String(err),
      });
      // 500 so Paystack retries — this is a server-side bug, not a payload
      // problem.
      res.status(500).json({ ok: false, error: 'processing_failed' });
    }
  }
);
