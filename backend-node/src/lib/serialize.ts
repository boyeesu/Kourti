/**
 * Response serializers — strip internal/operational columns from rows before
 * they reach a client (data minimization, GDPR Art. 5(1)(c)). `select *` on a
 * table whose schema grows over time otherwise leaks new fields automatically.
 */

// Operational fields on `profiles` that an end user must never see about
// themselves (admin notes, who disabled them, password-flow flags).
const INTERNAL_PROFILE_FIELDS = [
  'disabled_reason',
  'disabled_by',
  'disabled_at',
  'approved_by',
  'must_change_password',
  'password_reset_required',
  'processing_restricted_at',
];

export function publicProfile<T extends Record<string, unknown> | null | undefined>(row: T): T {
  if (!row || typeof row !== 'object') return row;
  const copy = { ...(row as Record<string, unknown>) };
  for (const f of INTERNAL_PROFILE_FIELDS) delete copy[f];
  return copy as T;
}
