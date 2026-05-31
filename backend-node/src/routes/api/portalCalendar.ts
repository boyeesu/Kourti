import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { asyncHandler, ApiError } from '../../lib/http.js';
import { assertClientCaseAccess } from '../../services/portalAccess.js';
import { hasFeature } from '../../services/entitlements.js';
import { recordCaseEvent } from '../../services/caseEvents.js';

// ════════════════════════════════════════════════════════════════════════
// Client-facing calendar router.
//
//   portalCalendarRouter — Mounted by the app at /api/v1/portal behind
//                          `requireClientAuth`. Every handler is client-scoped
//                          via req.clientAuth.clientUserId and deny-by-default
//                          through client_case_access. A firm that has
//                          downgraded out of the `client_portal` feature has
//                          its events disappear from the client's view
//                          (per-firm gating, mirrors portal.ts GET /matters).
//
// SAFE fields only: id, title, description, start_date, end_date, location,
// event_type. NEVER attendees or internal recurrence internals.
// ════════════════════════════════════════════════════════════════════════

export const portalCalendarRouter = Router();

const caseIdParamsSchema = z.object({ caseId: z.string().uuid() });

const rsvpParamsSchema = z.object({
  caseId: z.string().uuid(),
  eventId: z.string().uuid(),
});

const rsvpBodySchema = z.object({
  response: z.enum(['accepted', 'declined', 'tentative']),
});

// ── GET /calendar — upcoming events across all accessible matters ──────────

portalCalendarRouter.get(
  '/calendar',
  asyncHandler(async (req, res) => {
    const { clientUserId } = req.clientAuth!;

    const result = await db.query<{
      id: string;
      title: string;
      description: string | null;
      start_date: string;
      end_date: string;
      location: string | null;
      event_type: string | null;
      case_id: string;
      matter_title: string;
      organization_id: string;
      org_name: string;
      rsvp: string | null;
    }>(
      `
      select
        e.id,
        e.title,
        e.description,
        e.start_date,
        e.end_date,
        e.location,
        e.event_type,
        e.case_id,
        c.title as matter_title,
        o.id as organization_id,
        o.name as org_name,
        rs.response as rsvp
      from public.calendar_events e
      join public.cases c on c.id = e.case_id
      join public.organizations o on o.id = c.organization_id
      left join public.calendar_event_rsvps rs
        on rs.calendar_event_id = e.id and rs.client_user_id = $1
      where e.client_visible = true
        and e.end_date >= now() - interval '1 day'
        and (
          exists (
            select 1 from public.client_case_access cca
             where cca.client_user_id = $1
               and cca.case_id = c.id
               and cca.status = 'active'
          )
          or (
            exists (
              select 1 from public.client_portal_access cpa
               where cpa.client_user_id = $1
                 and cpa.status = 'active'
                 and cpa.client_id = c.client_id
            )
            and not coalesce(c.portal_private, false)
          )
        )
      order by e.start_date asc
      `,
      [clientUserId]
    );

    // Drop any event whose firm no longer has the `client_portal` feature.
    // Mirror the JS filter in portal.ts GET /matters: de-dupe org ids, then
    // resolve hasFeature once per org.
    const orgIds = [...new Set(result.rows.map((r) => r.organization_id))];
    const featureByOrg = new Map<string, boolean>();
    await Promise.all(
      orgIds.map(async (orgId) => {
        featureByOrg.set(orgId, await hasFeature(orgId, 'client_portal'));
      })
    );

    const events = result.rows
      .filter((r) => featureByOrg.get(r.organization_id))
      .map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        startDate: r.start_date,
        endDate: r.end_date,
        location: r.location,
        eventType: r.event_type,
        rsvp: r.rsvp ?? null,
        caseId: r.case_id,
        matterTitle: r.matter_title,
        firm: {
          organizationId: r.organization_id,
          name: r.org_name,
        },
      }));

    res.status(200).json(events);
  })
);

// ── GET /matters/:caseId/calendar — events for one matter ──────────────────

portalCalendarRouter.get(
  '/matters/:caseId/calendar',
  asyncHandler(async (req, res) => {
    const { clientUserId } = req.clientAuth!;
    const { caseId } = caseIdParamsSchema.parse(req.params);
    await assertClientCaseAccess(clientUserId, caseId);

    const result = await db.query<{
      id: string;
      title: string;
      description: string | null;
      start_date: string;
      end_date: string;
      location: string | null;
      event_type: string | null;
      rsvp: string | null;
    }>(
      `
      select
        e.id,
        e.title,
        e.description,
        e.start_date,
        e.end_date,
        e.location,
        e.event_type,
        rs.response as rsvp
      from public.calendar_events e
      left join public.calendar_event_rsvps rs
        on rs.calendar_event_id = e.id and rs.client_user_id = $2
      where e.case_id = $1 and e.client_visible = true
      order by e.start_date asc
      `,
      [caseId, clientUserId]
    );

    res.status(200).json(
      result.rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        startDate: r.start_date,
        endDate: r.end_date,
        location: r.location,
        eventType: r.event_type,
        rsvp: r.rsvp ?? null,
      }))
    );
  })
);

// ── PUT /matters/:caseId/calendar/:eventId/rsvp — submit/update RSVP ─────────

portalCalendarRouter.put(
  '/matters/:caseId/calendar/:eventId/rsvp',
  asyncHandler(async (req, res) => {
    const { clientUserId } = req.clientAuth!;
    const { caseId, eventId } = rsvpParamsSchema.parse(req.params);
    const { response } = rsvpBodySchema.parse(req.body);

    // Deny-by-default access guard — also gives us the org for timeline event.
    const { organizationId } = await assertClientCaseAccess(clientUserId, caseId);

    // Verify the event belongs to this case AND is client_visible.
    // Fetch the title in the same query so we can use it in the timeline event.
    const eventCheck = await db.query<{ title: string }>(
      `select title
         from public.calendar_events
        where id = $1 and case_id = $2 and client_visible = true
        limit 1`,
      [eventId, caseId]
    );

    if (eventCheck.rows.length === 0) {
      throw new ApiError('Calendar event not found', 404, 'NOT_FOUND');
    }

    const eventTitle = eventCheck.rows[0].title;

    // Upsert the RSVP.
    await db.query(
      `insert into public.calendar_event_rsvps (calendar_event_id, client_user_id, response)
       values ($1, $2, $3)
       on conflict (calendar_event_id, client_user_id)
       do update set response = excluded.response, updated_at = now()`,
      [eventId, clientUserId, response]
    );

    // Capitalize the response for the body (e.g. "accepted" → "Accepted").
    const capitalizedResponse = response.charAt(0).toUpperCase() + response.slice(1);

    // Best-effort timeline event — never throws.
    void recordCaseEvent({
      organizationId,
      caseId,
      eventType: 'calendar_rsvp',
      title: `Client responded to "${eventTitle}"`,
      body: capitalizedResponse,
      clientVisible: true,
      actorType: 'client',
      actorId: clientUserId,
      payload: { calendarEventId: eventId, response },
    });

    res.status(200).json({ eventId, response });
  })
);
