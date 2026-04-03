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
  if (env.AUTH_MODE === 'development') {
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

  const token = authorizationHeader.replace('Bearer ', '').trim();
  if (!token) {
    throw new ApiError('Invalid authentication token', 401, 'UNAUTHORIZED');
  }

  // ── Custom JWT mode ─────────────────────────────────────────────────────
  if (env.AUTH_MODE === 'custom') {
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

  // ── Supabase mode (legacy, for backward compat) ─────────────────────────
  if (env.AUTH_MODE === 'supabase') {
    const { createClient } = await import('@supabase/supabase-js');

    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new ApiError('Supabase auth config missing', 503, 'CONFIG_ERROR');
    }

    const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      throw new ApiError('Invalid or expired authentication token', 401, 'UNAUTHORIZED');
    }

    const profileResult = await db.query<{ organization_id: string | null }>(
      'select organization_id from public.profiles where user_id = $1 limit 1',
      [user.id]
    );

    const organizationId = profileResult.rows[0]?.organization_id;
    if (!organizationId) {
      throw new ApiError('No organization assigned to user', 403, 'ORGANIZATION_REQUIRED');
    }

    return {
      userId: user.id,
      email: user.email ?? null,
      organizationId,
    };
  }

  throw new ApiError('Invalid AUTH_MODE configuration', 500, 'CONFIG_ERROR');
}
