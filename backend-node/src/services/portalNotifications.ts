import { db } from '../db/pool.js';
import { sendPortalNotificationEmail } from './email.js';

// ════════════════════════════════════════════════════════════════════════
// Portal notifications — fan-out + coalesced email.
//
// A client-visible case_event is fanned out into ONE portal_notifications row
// per client_user who can see the case (active client_case_access OR
// client-level client_portal_access on the case's client_id, respecting
// portal_private). Those rows drive the in-app bell/top-bar.
//
// Emails follow an "immediate, deduped" policy: instead of one email per event,
// a per-recipient debounce coalesces a burst of updates into a SINGLE email a
// short window after the last event. The window is reset on each new event, so
// a flurry of staff actions yields one tidy summary rather than a stream.
// ════════════════════════════════════════════════════════════════════════

/** Coalescing window: wait this long after the last event before emailing. */
const EMAIL_DEBOUNCE_MS = 90_000;

/** Human fallback titles when a case_event arrives without an explicit title. */
const DEFAULT_TITLES: Record<string, string> = {
  case_created: 'A new matter was shared with you',
  status_changed: 'A matter status changed',
  hearing_scheduled: 'A hearing was scheduled',
  document_shared: 'A new document was shared',
  document_added: 'A new document was added',
  client_message: 'New message from your legal team',
  invoice_sent: 'A new invoice is available',
  invoice_paid: 'A payment was recorded',
  update_sent: 'You have a new update',
  calendar_rsvp: 'Calendar response recorded',
};

export interface FanOutInput {
  eventId: string;
  organizationId: string;
  caseId: string;
  eventType: string;
  title?: string | null;
  body?: string | null;
  /** When the actor is a client, that client is excluded from the fan-out so a
   *  client never gets notified about their own action (e.g. their own message). */
  actorType?: 'staff' | 'client' | 'system' | 'agent';
  actorId?: string | null;
}

// Per-recipient debounce timers, keyed by client_user_id.
const pendingTimers = new Map<string, NodeJS.Timeout>();

/**
 * Fan out a single client-visible case_event to every client_user who can see
 * the case, then (re)arm the coalesced email timer for each recipient. Best
 * effort: never throws — notification delivery must not break the primary write.
 */
export async function fanOutCaseEvent(input: FanOutInput): Promise<void> {
  try {
    const title = (input.title?.trim() || DEFAULT_TITLES[input.eventType]) ?? 'New update';

    // Recipients = client_users with active access to this case, minus the
    // acting client (if any). Mirrors the access predicate in portal.ts
    // GET /matters: explicit per-matter grant OR client-level grant on a
    // non-private matter.
    const recipients = await db.query<{ client_user_id: string }>(
      `
      select distinct cu.id as client_user_id
        from public.client_users cu
       where cu.is_active = true
         and (
           exists (
             select 1 from public.client_case_access cca
              where cca.client_user_id = cu.id
                and cca.case_id = $1
                and cca.status = 'active'
           )
           or exists (
             select 1
               from public.client_portal_access cpa
               join public.cases c on c.id = $1
              where cpa.client_user_id = cu.id
                and cpa.status = 'active'
                and cpa.client_id = c.client_id
                and not coalesce(c.portal_private, false)
           )
         )
         and ($3::uuid is null or cu.id <> $3::uuid)
      `,
      [input.caseId, input.organizationId, input.actorType === 'client' ? input.actorId : null]
    );

    if (recipients.rows.length === 0) return;

    // Bulk-insert one notification per recipient.
    const values: string[] = [];
    const params: unknown[] = [
      input.organizationId,
      input.caseId,
      input.eventId,
      input.eventType,
      title,
      input.body ?? null,
    ];
    recipients.rows.forEach((r) => {
      values.push(`($${params.length + 1}, $1, $2, $3, $4, $5, $6)`);
      params.push(r.client_user_id);
    });

    await db.query(
      `insert into public.portal_notifications
         (client_user_id, organization_id, case_id, event_id, type, title, body)
       values ${values.join(', ')}`,
      params
    );

    // Arm the coalesced email for each recipient.
    for (const r of recipients.rows) {
      scheduleNotificationEmail(r.client_user_id);
    }
  } catch (err) {
    console.error(
      '[portalNotifications] fanOutCaseEvent failed:',
      err instanceof Error ? err.message : err
    );
  }
}

/** (Re)arm the per-recipient debounce timer. */
function scheduleNotificationEmail(clientUserId: string): void {
  const existing = pendingTimers.get(clientUserId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    pendingTimers.delete(clientUserId);
    void flushNotificationEmail(clientUserId);
  }, EMAIL_DEBOUNCE_MS);

  // Don't keep the process alive purely for a pending notification email.
  timer.unref?.();
  pendingTimers.set(clientUserId, timer);
}

/**
 * Send the coalesced notification email for one recipient: gather every
 * un-emailed, still-unread notification, send a single summary, and stamp the
 * rows as emailed. Honors the recipient's email_notifications_enabled flag.
 * Best effort — never throws.
 */
export async function flushNotificationEmail(clientUserId: string): Promise<void> {
  try {
    const userResult = await db.query<{
      email: string;
      full_name: string | null;
      email_notifications_enabled: boolean;
    }>(
      `select email, full_name, email_notifications_enabled
         from public.client_users where id = $1 limit 1`,
      [clientUserId]
    );
    const user = userResult.rows[0];
    if (!user || user.email_notifications_enabled === false) return;

    // Only items not yet emailed AND not yet read in-app (a client who already
    // saw it in the bell doesn't need an email about it).
    const items = await db.query<{
      id: string;
      title: string;
      body: string | null;
      case_id: string | null;
      firm_name: string;
    }>(
      `
      select n.id, n.title, n.body, n.case_id, o.name as firm_name
        from public.portal_notifications n
        join public.organizations o on o.id = n.organization_id
       where n.client_user_id = $1
         and n.email_sent_at is null
         and n.read_at is null
       order by n.created_at asc
      `,
      [clientUserId]
    );

    if (items.rows.length === 0) return;

    await sendPortalNotificationEmail({
      email: user.email,
      clientName: user.full_name ?? undefined,
      items: items.rows.map((r) => ({
        title: r.title,
        body: r.body,
        firmName: r.firm_name,
        caseId: r.case_id,
      })),
    });

    // Stamp emailed so a later burst doesn't resend these.
    await db.query(
      `update public.portal_notifications
          set email_sent_at = now()
        where id = any($1::uuid[])`,
      [items.rows.map((r) => r.id)]
    );
  } catch (err) {
    console.error(
      '[portalNotifications] flushNotificationEmail failed:',
      err instanceof Error ? err.message : err
    );
  }
}
