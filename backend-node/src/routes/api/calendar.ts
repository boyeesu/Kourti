import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { recordCaseEvent } from '../../services/caseEvents.js';

const uuidLike = z.string().regex(/^[0-9a-fA-F-]{36}$/);

const listEventsQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  clientId: uuidLike.optional(),
});

const eventParamsSchema = z.object({
  eventId: uuidLike,
});

const createEventBodySchema = z.object({
  title: z.string().trim().min(1),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  attendees: z.array(z.string()).optional(),
  event_type: z.string().optional(),
  case_id: uuidLike.optional(),
  client_id: uuidLike.optional(),
  is_recurring: z.boolean().optional(),
  recurrence_pattern: z
    .object({
      frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
      interval: z.number().int().min(1),
    })
    .optional(),
  recurrence_end_date: z.string().optional(),
  client_visible: z.boolean().optional(),
});

const updateEventBodySchema = createEventBodySchema.partial();

const shareCalendarBodySchema = z.object({
  shared_with_user_id: uuidLike,
  permission_level: z.enum(['view', 'edit']).default('view'),
});

const shareParamsSchema = z.object({
  shareId: uuidLike,
});

const updateShareBodySchema = z.object({
  permission_level: z.enum(['view', 'edit']).optional(),
  is_active: z.boolean().optional(),
});

/**
 * Best-effort: mirror a matter-linked calendar event onto the case timeline so
 * clients see upcoming dates. No-op when the event row has no case_id.
 * recordCaseEvent itself never throws; this wrapper is purely additive and
 * must never break the primary calendar write.
 */
async function emitCalendarCaseEvent(
  event: Record<string, unknown>,
  auth: { organizationId: string; userId: string }
): Promise<void> {
  const caseId = event.case_id as string | null | undefined;
  if (!caseId) return;

  const id = event.id as string;
  const eventTypeRaw = (event.event_type as string | null) ?? '';
  const title = (event.title as string | null) ?? null;
  const startDate = event.start_date as string | null;
  const endDate = event.end_date as string | null;
  const location = (event.location as string | null) ?? null;
  const clientVisible = Boolean(event.client_visible);

  const timelineType = /hearing|court/i.test(eventTypeRaw) ? 'hearing_scheduled' : 'calendar_event';

  const body = `${startDate ?? ''}${location ? ` at ${location}` : ''}`;

  await recordCaseEvent({
    organizationId: auth.organizationId,
    caseId,
    eventType: timelineType,
    title: title ?? undefined,
    body,
    payload: {
      calendarEventId: id,
      start_date: startDate,
      end_date: endDate,
      location,
    },
    actorType: 'staff',
    actorId: auth.userId,
    clientVisible,
  });
}

export const calendarRouter = Router();

// ── Events ──────────────────────────────────────────────────────────────────

calendarRouter.get(
  '/events',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { startDate, endDate, clientId } = listEventsQuerySchema.parse(req.query);

    const clauses: string[] = ['organization_id = $1'];
    const values: unknown[] = [auth.organizationId];

    if (startDate) {
      values.push(startDate);
      clauses.push(`start_date >= $${values.length}`);
    }
    if (endDate) {
      values.push(endDate);
      clauses.push(`end_date <= $${values.length}`);
    }
    if (clientId) {
      values.push(clientId);
      clauses.push(`client_id = $${values.length}`);
    }

    const result = await db.query(
      `select * from public.calendar_events where ${clauses.join(' and ')} order by start_date asc`,
      values
    );

    res.status(200).json(result.rows);
  })
);

calendarRouter.get(
  '/events/:eventId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { eventId } = eventParamsSchema.parse(req.params);

    const result = await db.query(
      'select * from public.calendar_events where id = $1 and organization_id = $2 limit 1',
      [eventId, auth.organizationId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Calendar event not found', 404, 'NOT_FOUND');
    }

    res.status(200).json(result.rows[0]);
  })
);

calendarRouter.post(
  '/events',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = createEventBodySchema.parse(req.body);

    const result = await db.query(
      `
      insert into public.calendar_events (
        title, description, start_date, end_date, location, attendees,
        event_type, case_id, client_id, organization_id, created_by,
        is_recurring, recurrence_pattern, recurrence_end_date, client_visible,
        created_at, updated_at
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now(),now())
      returning *
      `,
      [
        body.title,
        body.description || null,
        body.start_date,
        body.end_date,
        body.location || null,
        body.attendees ? JSON.stringify(body.attendees) : null,
        body.event_type || null,
        body.case_id || null,
        body.client_id || null,
        auth.organizationId,
        auth.userId,
        body.is_recurring || false,
        body.recurrence_pattern ? JSON.stringify(body.recurrence_pattern) : null,
        body.recurrence_end_date || null,
        body.client_visible ?? true,
      ]
    );

    const event = result.rows[0] as Record<string, unknown>;

    // Best-effort matter-timeline emission — recordCaseEvent never throws.
    await emitCalendarCaseEvent(event, auth);

    res.status(201).json(event);
  })
);

calendarRouter.patch(
  '/events/:eventId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { eventId } = eventParamsSchema.parse(req.params);
    const body = updateEventBodySchema.parse(req.body);

    // Verify ownership
    const ownership = await db.query(
      'select id from public.calendar_events where id = $1 and organization_id = $2 limit 1',
      [eventId, auth.organizationId]
    );
    if (!ownership.rows[0]) {
      throw new ApiError('Calendar event not found', 404, 'NOT_FOUND');
    }

    const updates: Array<{ col: string; val: unknown }> = [];
    if (body.title !== undefined) updates.push({ col: 'title', val: body.title });
    if (body.description !== undefined) updates.push({ col: 'description', val: body.description });
    if (body.start_date !== undefined) updates.push({ col: 'start_date', val: body.start_date });
    if (body.end_date !== undefined) updates.push({ col: 'end_date', val: body.end_date });
    if (body.location !== undefined) updates.push({ col: 'location', val: body.location });
    if (body.attendees !== undefined)
      updates.push({ col: 'attendees', val: JSON.stringify(body.attendees) });
    if (body.event_type !== undefined) updates.push({ col: 'event_type', val: body.event_type });
    if (body.case_id !== undefined) updates.push({ col: 'case_id', val: body.case_id });
    if (body.client_id !== undefined) updates.push({ col: 'client_id', val: body.client_id });
    if (body.is_recurring !== undefined)
      updates.push({ col: 'is_recurring', val: body.is_recurring });
    if (body.recurrence_pattern !== undefined)
      updates.push({ col: 'recurrence_pattern', val: JSON.stringify(body.recurrence_pattern) });
    if (body.recurrence_end_date !== undefined)
      updates.push({ col: 'recurrence_end_date', val: body.recurrence_end_date });
    if (body.client_visible !== undefined)
      updates.push({ col: 'client_visible', val: body.client_visible });

    if (!updates.length) {
      throw new ApiError('No update fields provided', 400, 'VALIDATION_ERROR');
    }

    const setClause = updates.map((u, i) => `${u.col} = $${i + 1}`).join(', ');
    const values = updates.map((u) => u.val);

    const result = await db.query(
      `update public.calendar_events set ${setClause}, updated_at = now() where id = $${values.length + 1} returning *`,
      [...values, eventId]
    );

    const event = result.rows[0] as Record<string, unknown>;

    // Best-effort matter-timeline emission — recordCaseEvent never throws.
    await emitCalendarCaseEvent(event, auth);

    res.status(200).json(event);
  })
);

calendarRouter.delete(
  '/events/:eventId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { eventId } = eventParamsSchema.parse(req.params);

    const result = await db.query(
      'delete from public.calendar_events where id = $1 and organization_id = $2 returning id',
      [eventId, auth.organizationId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Calendar event not found', 404, 'NOT_FOUND');
    }

    res.status(204).send();
  })
);

// ── Sharing ─────────────────────────────────────────────────────────────────

calendarRouter.get(
  '/shares/viewers',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db.query(
      `
      select cs.*, p.first_name, p.last_name, p.email
      from public.calendar_shares cs
      join public.profiles p on p.user_id = cs.shared_with_user_id
      where cs.calendar_owner_id = $1
        and cs.organization_id = $2
        and cs.is_active = true
      order by cs.created_at desc
      `,
      [auth.userId, auth.organizationId]
    );

    res.status(200).json(result.rows);
  })
);

calendarRouter.get(
  '/shares/shared-with-me',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db.query(
      `
      select cs.*, p.first_name, p.last_name, p.email
      from public.calendar_shares cs
      join public.profiles p on p.user_id = cs.calendar_owner_id
      where cs.shared_with_user_id = $1
        and cs.organization_id = $2
        and cs.is_active = true
      order by cs.created_at desc
      `,
      [auth.userId, auth.organizationId]
    );

    res.status(200).json(result.rows);
  })
);

calendarRouter.get(
  '/shares/members',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db.query(
      `
      select user_id as id, first_name, last_name, email, calendar_color
      from public.profiles
      where organization_id = $1
        and user_id != $2
      order by first_name
      `,
      [auth.organizationId, auth.userId]
    );

    const members = result.rows.map((m: Record<string, unknown>) => ({
      id: m.id,
      name: `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email || '',
      email: m.email || '',
      color: m.calendar_color || '#3b82f6',
    }));

    res.status(200).json(members);
  })
);

calendarRouter.post(
  '/shares',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = shareCalendarBodySchema.parse(req.body);

    const result = await db.query(
      `
      insert into public.calendar_shares (
        calendar_owner_id, shared_with_user_id, organization_id,
        permission_level, is_active, created_at, updated_at
      )
      values ($1, $2, $3, $4, true, now(), now())
      returning *
      `,
      [auth.userId, body.shared_with_user_id, auth.organizationId, body.permission_level]
    );

    res.status(201).json(result.rows[0]);
  })
);

calendarRouter.patch(
  '/shares/:shareId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { shareId } = shareParamsSchema.parse(req.params);
    const body = updateShareBodySchema.parse(req.body);

    const updates: Array<{ col: string; val: unknown }> = [];
    if (body.permission_level !== undefined)
      updates.push({ col: 'permission_level', val: body.permission_level });
    if (body.is_active !== undefined) updates.push({ col: 'is_active', val: body.is_active });

    if (!updates.length) {
      throw new ApiError('No update fields', 400, 'VALIDATION_ERROR');
    }

    const setClause = updates.map((u, i) => `${u.col} = $${i + 1}`).join(', ');
    const values = updates.map((u) => u.val);

    const result = await db.query(
      `update public.calendar_shares set ${setClause}, updated_at = now() where id = $${values.length + 1} and organization_id = $${values.length + 2} returning *`,
      [...values, shareId, auth.organizationId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Calendar share not found', 404, 'NOT_FOUND');
    }

    res.status(200).json(result.rows[0]);
  })
);

// ── External calendar sync ──────────────────────────────────────────────────

const externalSyncBodySchema = z.object({
  provider: z.enum(['google_calendar', 'microsoft_teams']),
  action: z.enum(['list-events']),
  timeMin: z.string().optional(),
  timeMax: z.string().optional(),
});

calendarRouter.post(
  '/external-sync',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = externalSyncBodySchema.parse(req.body);

    // Check if user has an active integration for this provider
    const integration = await db.query(
      `SELECT id, access_token, refresh_token, sync_enabled
       FROM public.user_calendar_integrations
       WHERE user_id = $1 AND organization_id = $2 AND provider = $3 AND sync_enabled = true
       LIMIT 1`,
      [auth.userId, auth.organizationId, body.provider]
    );

    if (!integration.rows[0]) {
      // No integration configured — return empty events (not an error)
      res.status(200).json({ events: [], provider: body.provider, configured: false });
      return;
    }

    // TODO: Implement actual Google/Microsoft API calls using stored OAuth tokens.
    // For now, return empty events to prevent frontend errors.
    res.status(200).json({
      events: [],
      provider: body.provider,
      configured: true,
      message: `${body.provider} sync is configured but real-time API integration is pending.`,
    });
  })
);

// ── Integrations (calendar sync) ────────────────────────────────────────────

calendarRouter.get(
  '/integrations',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db.query(
      `
      select *
      from public.user_calendar_integrations
      where user_id = $1 and organization_id = $2
      order by created_at desc
      `,
      [auth.userId, auth.organizationId]
    );

    res.status(200).json(result.rows);
  })
);

calendarRouter.patch(
  '/integrations/:integrationId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { integrationId } = z.object({ integrationId: uuidLike }).parse(req.params);
    const body = z
      .object({
        sync_enabled: z.boolean().optional(),
        sync_direction: z.enum(['import', 'export', 'bidirectional']).optional(),
      })
      .parse(req.body);

    const updates: Array<{ col: string; val: unknown }> = [];
    if (body.sync_enabled !== undefined)
      updates.push({ col: 'sync_enabled', val: body.sync_enabled });
    if (body.sync_direction !== undefined)
      updates.push({ col: 'sync_direction', val: body.sync_direction });

    if (!updates.length) {
      throw new ApiError('No update fields', 400, 'VALIDATION_ERROR');
    }

    const setClause = updates.map((u, i) => `${u.col} = $${i + 1}`).join(', ');
    const values = updates.map((u) => u.val);

    const result = await db.query(
      `update public.user_calendar_integrations set ${setClause}, updated_at = now() where id = $${values.length + 1} and user_id = $${values.length + 2} returning *`,
      [...values, integrationId, auth.userId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Integration not found', 404, 'NOT_FOUND');
    }

    res.status(200).json(result.rows[0]);
  })
);

calendarRouter.delete(
  '/integrations/:integrationId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { integrationId } = z.object({ integrationId: uuidLike }).parse(req.params);

    const result = await db.query(
      'delete from public.user_calendar_integrations where id = $1 and user_id = $2 returning id',
      [integrationId, auth.userId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Integration not found', 404, 'NOT_FOUND');
    }

    res.status(204).send();
  })
);
