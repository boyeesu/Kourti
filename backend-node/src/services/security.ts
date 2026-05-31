/**
 * Breach-incident service (GDPR Art. 33/34, NDPR).
 *
 * Records a formal incident that starts the 72-hour notification clock — see
 * docs/compliance/BREACH_RESPONSE_RUNBOOK.md. The lower-level anomaly feed
 * (auth failures, bulk exports, signed-URL abuse) lives in `securityEvents.ts`
 * and writes to the same `security_events` table.
 */
import { db } from '../db/pool.js';

export interface BreachInput {
  title: string;
  description?: string;
  severity?: 'sev1' | 'sev2' | 'sev3' | 'sev4';
  affectedDataCategories?: string[];
  affectedSubjectCount?: number | null;
  affectedOrganizationIds?: string[];
  detectedBy?: string | null;
  details?: Record<string, unknown>;
}

/**
 * Open a breach incident. `awareness_at` is stamped now — that is the moment
 * the 72-hour clock starts under Art. 33.
 */
export async function openBreachIncident(
  input: BreachInput
): Promise<{ id: string; reference: string }> {
  const reference = `BR-${new Date().toISOString().slice(0, 10)}-${Math.floor(Date.now() % 100000)
    .toString()
    .padStart(5, '0')}`;
  const res = await db.query<{ id: string; reference: string }>(
    `insert into public.breach_incidents
       (reference, title, description, severity, awareness_at,
        affected_data_categories, affected_subject_count, affected_organization_ids,
        detected_by, details)
     values ($1,$2,$3,$4, now(), $5,$6,$7,$8,$9::jsonb)
     returning id, reference`,
    [
      reference,
      input.title,
      input.description ?? null,
      input.severity ?? 'sev3',
      input.affectedDataCategories ?? null,
      input.affectedSubjectCount ?? null,
      input.affectedOrganizationIds ?? null,
      input.detectedBy ?? null,
      JSON.stringify(input.details ?? {}),
    ]
  );
  console.warn(
    `[breach] OPENED ${reference} — 72h notification clock started. See BREACH_RESPONSE_RUNBOOK.md`
  );
  return res.rows[0];
}
