import { env } from '../config/env.js';
import { db } from '../db/pool.js';
import { ApiError } from '../lib/http.js';
import { verifyAccessToken, getTokenVersion } from './jwt.js';

function normalizeHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function authenticateRequest(headers: {
  authorization?: string | string[];
  'x-dev-user-id'?: string | string[];
  'x-dev-organization-id'?: string | string[];
}) {
  // ── Development mode ────────────────────────────────────────────────────
  // Only honor the dev-headers escape hatch when both AUTH_MODE and
  // NODE_ENV say we're in development. The env validator forbids
  // production+development; this also closes staging/preview envs
  // that might otherwise accept any user/org via headers.
  if (env.AUTH_MODE === 'development' && env.NODE_ENV === 'development') {
    return {
      userId: normalizeHeaderValue(headers['x-dev-user-id']) || env.DEV_DEFAULT_USER_ID,
      email: null,
      organizationId:
        normalizeHeaderValue(headers['x-dev-organization-id']) || env.DEV_DEFAULT_ORG_ID,
    };
  }

  // ── Extract token ───────────────────────────────────────────────────────
  const authorizationHeader = normalizeHeaderValue(headers.authorization) || null;
  if (!authorizationHeader) {
    throw new ApiError('Authentication required', 401, 'UNAUTHORIZED');
  }

  // Strict Bearer scheme check so a non-Bearer credential (e.g. "Basic …")
  // can't get reflected through verifyAccessToken.
  const bearerMatch = authorizationHeader.match(/^Bearer\s+(\S+)$/);
  if (!bearerMatch) {
    throw new ApiError('Invalid authentication scheme', 401, 'UNAUTHORIZED');
  }
  const token = bearerMatch[1];

  // ── Custom JWT mode ─────────────────────────────────────────────────────
  const authUser = verifyAccessToken(token);

  // ── Access-token revocation (token epoch) ────────────────────────────────
  // Regular access tokens carry the `tv` claim they were minted at. A DB read
  // per request compares it against the user's current token_version; a
  // mismatch means the token was revoked (logout-all / password change / reset
  // / 2FA disabled / refresh-token reuse) and is rejected. Impersonation tokens
  // don't carry `tv` — they're force-revocable via the impersonation_sessions
  // check below — so we only enforce this for non-impersonation tokens.
  if (!authUser.impersonation) {
    const currentVersion = await getTokenVersion(authUser.id);
    if ((authUser.tokenVersion ?? 0) !== currentVersion) {
      throw new ApiError('Access has been revoked. Please sign in again.', 401, 'TOKEN_REVOKED');
    }
  }

  // ── Impersonation tokens ─────────────────────────────────────────────────
  // A "View as" token carries an `imp` claim. Re-validate the backing session
  // on every request so an admin can force-revoke it (or it can expire) and the
  // impersonation immediately stops working — the token alone is not enough.
  let impersonation: { sessionId: string; by: string; scope: 'read' | 'write' } | undefined;
  if (authUser.impersonation) {
    const session = await db.query<{ scope: 'read' | 'write' }>(
      `select scope
         from public.impersonation_sessions
        where id = $1
          and admin_user_id = $2
          and ended_at is null
          and expires_at > now()
        limit 1`,
      [authUser.impersonation.sid, authUser.impersonation.by]
    );
    if (!session.rows[0]) {
      throw new ApiError('Impersonation session has ended', 401, 'IMPERSONATION_ENDED');
    }
    impersonation = {
      sessionId: authUser.impersonation.sid,
      by: authUser.impersonation.by,
      scope: session.rows[0].scope,
    };
  }

  // If the JWT already has an org claim, use it; otherwise look up from profiles
  let organizationId = authUser.organizationId;
  if (
    !organizationId ||
    organizationId === '' ||
    organizationId === '00000000-0000-0000-0000-000000000000'
  ) {
    const profileResult = await db.query<{ organization_id: string | null }>(
      'select organization_id from public.profiles where user_id = $1 limit 1',
      [authUser.id]
    );
    organizationId = profileResult.rows[0]?.organization_id || '';
  }

  return {
    userId: authUser.id,
    email: authUser.email,
    organizationId:
      !organizationId || organizationId === '00000000-0000-0000-0000-000000000000'
        ? ''
        : organizationId,
    impersonation,
  };
}
