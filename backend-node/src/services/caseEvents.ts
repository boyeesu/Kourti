import { db } from '../db/pool.js';

// ── Types ─────────────────────────────────────────────────────────────────

export type CaseEventType =
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
  // Allow arbitrary strings while keeping IntelliSense on the known set.
  | (string & {});

export interface RecordCaseEventInput {
  organizationId: string;
  caseId: string;
  eventType: CaseEventType;
  title?: string;
  body?: string;
  payload?: Record<string, unknown>;
  actorType?: 'staff' | 'client' | 'system' | 'agent'; // default 'staff'
  actorId?: string | null;
  /** When omitted, use DEFAULT_VISIBILITY[eventType] ?? false. */
  clientVisible?: boolean;
}

/**
 * Default client visibility per event_type. Anything not listed here is
 * NOT visible to the client (safe default) — see docs/client-portal-SPEC.md.
 */
export const DEFAULT_VISIBILITY: Record<string, boolean> = {
  case_created: true,
  status_changed: true,
  hearing_scheduled: true,
  document_shared: true,
  document_added: false,
  task_completed: false,
  note_added: false,
  client_message: true,
  invoice_sent: true,
  invoice_paid: true,
  update_sent: true,
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Append one row to case_events. Best-effort: never throws to the caller —
 * log and swallow, because event recording must not break the primary write.
 */
export async function recordCaseEvent(input: RecordCaseEventInput): Promise<void> {
  try {
    const clientVisible = input.clientVisible ?? DEFAULT_VISIBILITY[input.eventType] ?? false;
    const actorType = input.actorType ?? 'staff';

    await db.query(
      `INSERT INTO public.case_events
         (organization_id, case_id, event_type, title, body, payload,
          actor_type, actor_id, client_visible, occurred_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, now(), now())`,
      [
        input.organizationId,
        input.caseId,
        input.eventType,
        input.title ?? null,
        input.body ?? null,
        JSON.stringify(input.payload ?? {}),
        actorType,
        input.actorId ?? null,
        clientVisible,
      ]
    );
  } catch (err) {
    // Swallow: a failed timeline write must never break the primary write.
    console.error('[caseEvents] recordCaseEvent failed:', err instanceof Error ? err.message : err);
  }
}
