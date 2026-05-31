import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { asyncHandler } from '../../lib/http.js';

// ════════════════════════════════════════════════════════════════════════
// portalNotificationsRouter — mounted at /api/v1/portal behind
//   requireClientAuth. Provides read/mark-read access to the
//   portal_notifications table for the authenticated client user.
// ════════════════════════════════════════════════════════════════════════

export const portalNotificationsRouter = Router();

const notificationIdParamsSchema = z.object({ id: z.string().uuid() });

// ── GET /notifications — 30 most recent notifications ─────────────────────

portalNotificationsRouter.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    const { clientUserId } = req.clientAuth!;

    const result = await db.query<{
      id: string;
      type: string;
      title: string;
      body: string | null;
      case_id: string | null;
      matter_title: string | null;
      organization_id: string;
      org_name: string;
      read_at: string | null;
      created_at: string;
    }>(
      `
      select
        n.id,
        n.type,
        n.title,
        n.body,
        n.case_id,
        c.title as matter_title,
        o.id    as organization_id,
        o.name  as org_name,
        n.read_at,
        n.created_at
      from public.portal_notifications n
      join public.organizations o on o.id = n.organization_id
      left join public.cases c on c.id = n.case_id
      where n.client_user_id = $1
      order by n.created_at desc
      limit 30
      `,
      [clientUserId]
    );

    res.status(200).json(
      result.rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        body: r.body,
        caseId: r.case_id,
        matterTitle: r.matter_title,
        firm: {
          organizationId: r.organization_id,
          name: r.org_name,
        },
        readAt: r.read_at,
        createdAt: r.created_at,
      }))
    );
  })
);

// ── GET /notifications/unread-count ────────────────────────────────────────

portalNotificationsRouter.get(
  '/notifications/unread-count',
  asyncHandler(async (req, res) => {
    const { clientUserId } = req.clientAuth!;

    const result = await db.query<{ count: number }>(
      `select count(*)::int as count
         from public.portal_notifications
        where client_user_id = $1 and read_at is null`,
      [clientUserId]
    );

    res.status(200).json({ count: result.rows[0]?.count ?? 0 });
  })
);

// ── POST /notifications/read-all ───────────────────────────────────────────

portalNotificationsRouter.post(
  '/notifications/read-all',
  asyncHandler(async (req, res) => {
    const { clientUserId } = req.clientAuth!;

    await db.query(
      `update public.portal_notifications
          set read_at = now()
        where client_user_id = $1 and read_at is null`,
      [clientUserId]
    );

    res.status(200).json({ ok: true });
  })
);

// ── POST /notifications/:id/read ───────────────────────────────────────────

portalNotificationsRouter.post(
  '/notifications/:id/read',
  asyncHandler(async (req, res) => {
    const { clientUserId } = req.clientAuth!;
    const { id } = notificationIdParamsSchema.parse(req.params);

    await db.query(
      `update public.portal_notifications
          set read_at = now()
        where id = $1 and client_user_id = $2 and read_at is null`,
      [id, clientUserId]
    );

    res.status(200).json({ ok: true });
  })
);
