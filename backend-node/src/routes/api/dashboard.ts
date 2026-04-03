import { Router } from 'express';

import { db } from '../../db/pool.js';
import { asyncHandler } from '../../lib/http.js';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const orgId = auth.organizationId;

    const now = new Date();
    const endOfWeek = new Date(now);
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    endOfWeek.setHours(23, 59, 59, 999);

    const [
      casesCount,
      activeCasesCount,
      clientsCount,
      documentsCount,
      paidInvoices,
      upcomingEventsCount,
      recentCases,
      recentClients,
      upcomingEvents,
    ] = await Promise.all([
      db.query<{ count: number }>(
        'select count(*)::int as count from public.cases where organization_id = $1',
        [orgId]
      ),
      db.query<{ count: number }>(
        "select count(*)::int as count from public.cases where organization_id = $1 and status in ('open','active','in_progress')",
        [orgId]
      ),
      db.query<{ count: number }>(
        'select count(*)::int as count from public.clients where organization_id = $1',
        [orgId]
      ),
      db.query<{ count: number }>(
        'select count(*)::int as count from public.documents where organization_id = $1',
        [orgId]
      ),
      db
        .query<{
          total_amount: number;
        }>("select coalesce(sum(total_amount),0)::numeric as total_amount from public.invoices where organization_id = $1 and status = 'paid'", [orgId])
        .catch(() => ({ rows: [{ total_amount: 0 }] })),
      db
        .query<{
          count: number;
        }>('select count(*)::int as count from public.calendar_events where organization_id = $1 and start_date > $2 and start_date <= $3', [orgId, now.toISOString(), endOfWeek.toISOString()])
        .catch(() => ({ rows: [{ count: 0 }] })),
      db.query(
        `select c.id, c.title, c.status, c.created_at, c.client_id,
           json_build_object('name', cl.name) as client
         from public.cases c
         left join public.clients cl on cl.id = c.client_id
         where c.organization_id = $1
         order by c.created_at desc limit 5`,
        [orgId]
      ),
      db.query(
        'select id, name, email, created_at, company from public.clients where organization_id = $1 order by created_at desc limit 5',
        [orgId]
      ),
      db
        .query(
          `select id, title, start_date, end_date, event_type, case_id
         from public.calendar_events
         where organization_id = $1 and start_date > $2 and start_date <= $3
         order by start_date asc limit 5`,
          [orgId, now.toISOString(), endOfWeek.toISOString()]
        )
        .catch(() => ({ rows: [] })),
    ]);

    res.status(200).json({
      totalCases: casesCount.rows[0]?.count || 0,
      activeCases: activeCasesCount.rows[0]?.count || 0,
      totalClients: clientsCount.rows[0]?.count || 0,
      totalDocuments: documentsCount.rows[0]?.count || 0,
      totalRevenue: Number(paidInvoices.rows[0]?.total_amount || 0),
      upcomingEvents: upcomingEventsCount.rows[0]?.count || 0,
      recentCases: recentCases.rows,
      recentClients: recentClients.rows,
      upcomingCalendarEvents: upcomingEvents.rows,
    });
  })
);

dashboardRouter.get(
  '/insights',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const orgId = auth.organizationId;
    const windowDays = Number(req.query.windowDays) || 7;

    const now = new Date();
    const futureDate = new Date(now.getTime() + windowDays * 86400000);

    const [upcomingCases, upcomingContracts] = await Promise.all([
      db.query(
        `select c.id, c.title, c.status, c.priority, c.next_hearing_date, c.court,
           json_build_object('id', cl.id, 'name', cl.name) as client
         from public.cases c
         left join public.clients cl on cl.id = c.client_id
         where c.organization_id = $1
           and c.next_hearing_date >= $2
           and c.next_hearing_date <= $3
         order by c.next_hearing_date asc limit 5`,
        [orgId, now.toISOString(), futureDate.toISOString()]
      ),
      db.query(
        `select co.id, co.title, co.status, co.value, co.currency, co.end_date,
           json_build_object('id', cl.id, 'name', cl.name) as client
         from public.contracts co
         left join public.clients cl on cl.id = co.client_id
         where co.organization_id = $1
           and co.status = 'active'
           and co.end_date >= $2
           and co.end_date <= $3
         order by co.end_date asc limit 5`,
        [orgId, now.toISOString(), futureDate.toISOString()]
      ),
    ]);

    res.status(200).json({
      upcomingCases: upcomingCases.rows,
      upcomingContracts: upcomingContracts.rows,
    });
  })
);
