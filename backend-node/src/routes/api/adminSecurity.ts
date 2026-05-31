/**
 * Platform-admin data-protection surface: breach register, security-event
 * feed, and operator-assisted DSAR actions (export / erase a specific subject
 * when a request arrives by email rather than self-service).
 *
 * Mounted at /api/v1/admin behind requireAuth. Reads need 'platform.read';
 * breach writes and erasure need superadmin (requirePlatformAdminUser) and are
 * audited via admin_actions.
 *
 * See docs/compliance/BREACH_RESPONSE_RUNBOOK.md and DSAR_PROCEDURE.md.
 */
import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { asyncHandler, ApiError } from '../../lib/http.js';
import {
  requireAdminCapabilityFor,
  requirePlatformAdminUser,
} from '../../services/authorization.js';
import { recordAdminAction } from '../../services/adminAudit.js';
import { openBreachIncident } from '../../services/security.js';
import { exportUserData, eraseUser, eraseClientUser } from '../../services/privacy.js';

export const adminSecurityRouter = Router();

// ── Breach register ─────────────────────────────────────────────────────────

adminSecurityRouter.get(
  '/breaches',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');
    const result = await db.query(
      `select id, reference, title, severity, status, detected_at, awareness_at,
              authority_notified_at, subjects_notified_at, customers_notified_at
         from public.breach_incidents order by detected_at desc limit 200`
    );
    res.status(200).json({ rows: result.rows });
  })
);

const createBreachSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(5000).optional(),
  severity: z.enum(['sev1', 'sev2', 'sev3', 'sev4']).optional(),
  affectedDataCategories: z.array(z.string().trim().min(1)).optional(),
  affectedSubjectCount: z.number().int().min(0).optional(),
  affectedOrganizationIds: z.array(z.string().uuid()).optional(),
});

adminSecurityRouter.post(
  '/breaches',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    await requirePlatformAdminUser(auth.userId);
    const body = createBreachSchema.parse(req.body ?? {});
    const incident = await openBreachIncident({ ...body, detectedBy: auth.userId });
    await recordAdminAction({
      adminUserId: auth.userId,
      actionType: 'breach.open',
      targetType: 'breach_incident',
      targetId: incident.id,
      reason: body.title,
      req,
    }).catch(() => undefined);
    res.status(201).json(incident);
  })
);

const updateBreachSchema = z.object({
  status: z.enum(['open', 'triaged', 'contained', 'notifying', 'closed']).optional(),
  authorityNotified: z.boolean().optional(),
  subjectsNotified: z.boolean().optional(),
  customersNotified: z.boolean().optional(),
  notifyAuthorityRequired: z.boolean().optional(),
});

adminSecurityRouter.patch(
  '/breaches/:id',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    await requirePlatformAdminUser(auth.userId);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = updateBreachSchema.parse(req.body ?? {});

    const sets: string[] = [];
    const vals: unknown[] = [];
    const push = (frag: string, val: unknown) => {
      vals.push(val);
      sets.push(frag.replace('?', `$${vals.length}`));
    };
    if (body.status) push('status = ?', body.status);
    if (body.notifyAuthorityRequired !== undefined)
      push('notify_authority_required = ?', body.notifyAuthorityRequired);
    if (body.authorityNotified) sets.push('authority_notified_at = now()');
    if (body.subjectsNotified) sets.push('subjects_notified_at = now()');
    if (body.customersNotified) sets.push('customers_notified_at = now()');
    if (!sets.length) throw new ApiError('No changes', 400, 'NO_CHANGES');
    sets.push('updated_at = now()');
    vals.push(id);

    const result = await db.query(
      `update public.breach_incidents set ${sets.join(', ')} where id = $${vals.length} returning *`,
      vals
    );
    if (!result.rows[0]) throw new ApiError('Breach not found', 404, 'NOT_FOUND');
    await recordAdminAction({
      adminUserId: auth.userId,
      actionType: 'breach.update',
      targetType: 'breach_incident',
      targetId: id,
      req,
    }).catch(() => undefined);
    res.status(200).json(result.rows[0]);
  })
);

// ── Security-event feed ───────────────────────────────────────────────────

adminSecurityRouter.get(
  '/security-events',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');
    const { severity, limit } = z
      .object({
        severity: z.enum(['info', 'warning', 'critical']).optional(),
        limit: z.coerce.number().int().positive().max(1000).optional().default(200),
      })
      .parse(req.query);
    const result = await db.query(
      `select id, event_type, severity, actor_type, actor_id, organization_id, ip_address, details, created_at
         from public.security_events
        ${severity ? 'where severity = $2' : ''}
        order by created_at desc limit $1`,
      severity ? [limit, severity] : [limit]
    );
    res.status(200).json({ rows: result.rows });
  })
);

// ── Operator-assisted DSAR ────────────────────────────────────────────────

adminSecurityRouter.get(
  '/dsar/users/:userId/export',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    await requirePlatformAdminUser(auth.userId);
    const { userId } = z.object({ userId: z.string().uuid() }).parse(req.params);
    const data = await exportUserData(userId);
    await recordAdminAction({
      adminUserId: auth.userId,
      actionType: 'dsar.export',
      targetType: 'user',
      targetId: userId,
      req,
    }).catch(() => undefined);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="dsar-${userId}.json"`);
    res.status(200).send(JSON.stringify(data, null, 2));
  })
);

const eraseSchema = z.object({
  confirm: z.literal('ERASE'),
  reason: z.string().trim().max(500).optional(),
});

adminSecurityRouter.post(
  '/dsar/users/:userId/erase',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    await requirePlatformAdminUser(auth.userId);
    const { userId } = z.object({ userId: z.string().uuid() }).parse(req.params);
    const { reason } = eraseSchema.parse(req.body ?? {});
    const result = await eraseUser(userId);
    await recordAdminAction({
      adminUserId: auth.userId,
      actionType: 'dsar.erase',
      targetType: 'user',
      targetId: userId,
      reason: reason ?? 'data-subject erasure request',
      req,
    }).catch(() => undefined);
    res.status(200).json({ erased: true, ...result });
  })
);

adminSecurityRouter.post(
  '/dsar/client-users/:clientUserId/erase',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    await requirePlatformAdminUser(auth.userId);
    const { clientUserId } = z.object({ clientUserId: z.string().uuid() }).parse(req.params);
    const { reason } = eraseSchema.parse(req.body ?? {});
    const result = await eraseClientUser(clientUserId);
    await recordAdminAction({
      adminUserId: auth.userId,
      actionType: 'dsar.erase',
      targetType: 'client_user',
      targetId: clientUserId,
      reason: reason ?? 'data-subject erasure request',
      req,
    }).catch(() => undefined);
    res.status(200).json({ erased: true, ...result });
  })
);
