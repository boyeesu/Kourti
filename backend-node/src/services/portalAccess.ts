import { db } from '../db/pool.js';
import { ApiError } from '../lib/http.js';
import { hasFeature } from './entitlements.js';

/**
 * Deny-by-default access guard for the client portal — the single source of
 * truth used by every portal router (matters, team, calendar, documents).
 *
 * Implements the v1.2 CLIENT-LEVEL canonical access predicate. A client_user
 * `:me` sees case C ⇔ hasFeature(C.organization_id,'client_portal') AND:
 *   explicit    := an ACTIVE client_case_access row for (:me, C.id)
 *   clientLevel := an ACTIVE client_portal_access row for (:me, C.client_id)
 *   visible     := explicit OR (clientLevel AND NOT coalesce(C.portal_private,false))
 *
 * Returns the owning org when the matter is visible AND that org STILL has the
 * `client_portal` feature (it may have downgraded after the grant was made).
 *
 * Throws ApiError 404 NOT_FOUND otherwise. We never distinguish "no access"
 * from "firm downgraded" to the client — both look like the matter doesn't
 * exist, which is the safe disclosure posture.
 */
export async function assertClientCaseAccess(
  clientUserId: string,
  caseId: string
): Promise<{ organizationId: string }> {
  const result = await db.query<{
    organization_id: string;
    explicit: boolean;
    client_level: boolean;
    portal_private: boolean;
  }>(
    `select
        c.organization_id,
        exists (
          select 1 from public.client_case_access cca
           where cca.client_user_id = $1
             and cca.case_id = c.id
             and cca.status = 'active'
        ) as explicit,
        exists (
          select 1 from public.client_portal_access cpa
           where cpa.client_user_id = $1
             and cpa.status = 'active'
             and cpa.client_id = c.client_id
        ) as client_level,
        coalesce(c.portal_private, false) as portal_private
       from public.cases c
      where c.id = $2
      limit 1`,
    [clientUserId, caseId]
  );

  const row = result.rows[0];
  const visible = row != null && (row.explicit || (row.client_level && !row.portal_private));
  if (!row || !visible) {
    throw new ApiError('Matter not found', 404, 'NOT_FOUND');
  }

  const enabled = await hasFeature(row.organization_id, 'client_portal');
  if (!enabled) {
    throw new ApiError('Matter not found', 404, 'NOT_FOUND');
  }

  return { organizationId: row.organization_id };
}
