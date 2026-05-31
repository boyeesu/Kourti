import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { asyncHandler } from '../../lib/http.js';
import { getAdminCapabilities, requireAdminCapabilityFor } from '../../services/authorization.js';
import { recordAdminAction } from '../../services/adminAudit.js';
import { invalidateFeatureOverridesCache } from '../../services/featureOverrides.js';
import { FEATURE_KEYS } from '../../services/entitlements.js';

export const adminFeaturesRouter = Router();

// Who am I + what can I do? Drives /thanos tab visibility on the frontend.
adminFeaturesRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const caps = await getAdminCapabilities(req.auth!.userId);
    res.status(200).json({
      userId: req.auth!.userId,
      capabilities: [...caps],
      isPlatformStaff: caps.size > 0,
    });
  })
);

// The canonical feature keys, so the override UI can offer a dropdown.
adminFeaturesRouter.get(
  '/feature-keys',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'billing.manage');
    res.status(200).json(FEATURE_KEYS);
  })
);

// List active + scheduled-expired overrides for an org.
adminFeaturesRouter.get(
  '/organizations/:orgId/feature-overrides',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');
    const { orgId } = z.object({ orgId: z.string().regex(/^[0-9a-fA-F-]{36}$/) }).parse(req.params);

    const result = await db
      .query(
        `select fo.*, au.email as created_by_email
           from public.feature_overrides fo
           left join public.auth_users au on au.id = fo.created_by
          where fo.organization_id = $1
          order by fo.created_at desc`,
        [orgId]
      )
      .catch(() => ({ rows: [] }));
    res.status(200).json(result.rows);
  })
);

// Upsert an override (grant/revoke) for one org+feature.
adminFeaturesRouter.put(
  '/organizations/:orgId/feature-overrides',
  asyncHandler(async (req, res) => {
    const adminId = req.auth!.userId;
    await requireAdminCapabilityFor(adminId, 'billing.manage');
    const { orgId } = z.object({ orgId: z.string().regex(/^[0-9a-fA-F-]{36}$/) }).parse(req.params);
    const body = z
      .object({
        featureKey: z.enum(FEATURE_KEYS),
        mode: z.enum(['grant', 'revoke']),
        reason: z.string().trim().min(3).max(1000),
        expiresAt: z.string().datetime().nullish(),
      })
      .parse(req.body);

    const before = await db
      .query(
        `select mode, expires_at from public.feature_overrides
          where organization_id = $1 and feature_key = $2`,
        [orgId, body.featureKey]
      )
      .then((r) => r.rows[0] ?? null)
      .catch(() => null);

    const result = await db.query(
      `insert into public.feature_overrides
         (organization_id, feature_key, mode, reason, created_by, expires_at, updated_at)
       values ($1,$2,$3,$4,$5,$6, now())
       on conflict (organization_id, feature_key)
       do update set mode = excluded.mode,
                     reason = excluded.reason,
                     created_by = excluded.created_by,
                     expires_at = excluded.expires_at,
                     updated_at = now()
       returning *`,
      [orgId, body.featureKey, body.mode, body.reason, adminId, body.expiresAt ?? null]
    );
    invalidateFeatureOverridesCache();

    await recordAdminAction({
      adminUserId: adminId,
      actionType: 'feature_override.set',
      targetType: 'organization',
      targetId: orgId,
      reason: body.reason,
      before,
      after: { mode: body.mode, expires_at: body.expiresAt ?? null },
      details: { featureKey: body.featureKey },
      req,
    });

    res.status(200).json(result.rows[0]);
  })
);

// Remove an override (feature falls back to the plan matrix).
adminFeaturesRouter.delete(
  '/organizations/:orgId/feature-overrides/:featureKey',
  asyncHandler(async (req, res) => {
    const adminId = req.auth!.userId;
    await requireAdminCapabilityFor(adminId, 'billing.manage');
    const { orgId, featureKey } = z
      .object({
        orgId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
        featureKey: z.enum(FEATURE_KEYS),
      })
      .parse(req.params);

    await db.query(
      `delete from public.feature_overrides where organization_id = $1 and feature_key = $2`,
      [orgId, featureKey]
    );
    invalidateFeatureOverridesCache();

    await recordAdminAction({
      adminUserId: adminId,
      actionType: 'feature_override.remove',
      targetType: 'organization',
      targetId: orgId,
      details: { featureKey },
      req,
    });

    res.status(200).json({ ok: true });
  })
);
