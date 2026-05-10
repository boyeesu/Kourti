import { env } from '../config/env.js';
import { db } from '../db/pool.js';
import { ApiError } from '../lib/http.js';
import { verifyAccessToken } from './jwt.js';

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
  };
}
