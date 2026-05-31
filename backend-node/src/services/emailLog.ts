/**
 * Best-effort writer for the email deliverability log (public.email_delivery_log).
 *
 * Every transactional (Resend) and marketing-mirror (Brevo) provider call should
 * funnel a record through logEmailDelivery so platform admins get a single pane
 * of glass on what was sent, to whom, and whether it bounced/failed.
 *
 * CRITICAL: this is fire-and-forget. It wraps everything in try/catch and only
 * console.errors on failure — it must NEVER throw, because logging a send must
 * not be able to break the send itself.
 */
import { db } from '../db/pool.js';

export type EmailProvider = 'resend' | 'brevo';
export type EmailDeliveryStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'bounced'
  | 'complained'
  | 'failed';

export interface LogEmailDeliveryInput {
  provider: EmailProvider;
  toEmail: string;
  subject?: string;
  template?: string;
  providerMessageId?: string | null;
  status?: EmailDeliveryStatus;
  error?: string | null;
  organizationId?: string | null;
  userId?: string | null;
  metadata?: object;
}

/**
 * Insert one delivery record. Defaults status to 'sent'. Never throws.
 */
export async function logEmailDelivery(input: LogEmailDeliveryInput): Promise<void> {
  try {
    const toEmail = (input.toEmail || '').trim().toLowerCase();
    if (!toEmail) return;

    await db.query(
      `insert into public.email_delivery_log
         (provider, to_email, subject, template, provider_message_id,
          status, error, organization_id, user_id, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
      [
        input.provider,
        toEmail,
        input.subject ?? null,
        input.template ?? null,
        input.providerMessageId ?? null,
        input.status ?? 'sent',
        input.error ?? null,
        input.organizationId ?? null,
        input.userId ?? null,
        JSON.stringify(input.metadata ?? {}),
      ]
    );
  } catch (err) {
    // Logging must never break a send. Log loudly and swallow.
    console.error(
      '[emailLog] logEmailDelivery failed:',
      err instanceof Error ? err.message : err,
      `(provider=${input.provider} to=${input.toEmail} status=${input.status ?? 'sent'})`
    );
  }
}
