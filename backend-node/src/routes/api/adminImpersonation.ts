import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../lib/http.js';
import { adminRateLimit } from '../../middleware/adminRateLimit.js';
import { requireAdminCapabilityFor } from '../../services/authorization.js';
import {
  startImpersonation,
  endImpersonation,
  listActiveSessions,
} from '../../services/impersonation.js';

export const adminImpersonationRouter = Router();

// Start a "View as" session. Read scope needs impersonate.read; write scope
// needs the stronger impersonate.write capability. A reason is mandatory and
// lands in the audit trail.
adminImpersonationRouter.post(
  '/impersonation/start',
  // Cap how often any single admin can mint impersonation tokens.
  adminRateLimit('impersonation_start', 10, 60_000),
  asyncHandler(async (req, res) => {
    const adminId = req.auth!.userId;
    const body = z
      .object({
        targetUserId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
        scope: z.enum(['read', 'write']).default('read'),
        reason: z.string().trim().min(3).max(1000),
      })
      .parse(req.body);

    await requireAdminCapabilityFor(
      adminId,
      body.scope === 'write' ? 'impersonate.write' : 'impersonate.read'
    );

    const result = await startImpersonation({
      adminUserId: adminId,
      targetUserId: body.targetUserId,
      scope: body.scope,
      reason: body.reason,
      req,
    });

    res.status(201).json(result);
  })
);

// End a session. The impersonator can end their own; an admin with read cap can
// force-revoke any active session.
adminImpersonationRouter.post(
  '/impersonation/:sessionId/end',
  asyncHandler(async (req, res) => {
    const adminId = req.auth!.userId;
    await requireAdminCapabilityFor(adminId, 'impersonate.read');
    const { sessionId } = z
      .object({ sessionId: z.string().regex(/^[0-9a-fA-F-]{36}$/) })
      .parse(req.params);

    await endImpersonation(sessionId, adminId, req);
    res.status(200).json({ ok: true });
  })
);

adminImpersonationRouter.get(
  '/impersonation/active',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'impersonate.read');
    res.status(200).json(await listActiveSessions());
  })
);
