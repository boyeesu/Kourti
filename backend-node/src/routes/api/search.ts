import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { asyncHandler } from '../../lib/http.js';

const globalSearchSchema = z.object({
  term: z.string().trim().min(2),
});

export const searchRouter = Router();

searchRouter.get(
  '/global',
  asyncHandler(async (req, res) => {
    const parsed = globalSearchSchema.parse(req.query);
    const organizationId = req.auth!.organizationId;
    const term = `%${parsed.term}%`;

    const [casesResult, documentsResult, contractsResult, clientsResult] = await Promise.all([
      db.query(
        `
        select c.id, c.title, c.description, c.status, c.case_number, cl.name as client_name
        from public.cases c
        left join public.clients cl on cl.id = c.client_id
        where c.organization_id = $1
          and (c.title ilike $2 or c.description ilike $2 or c.case_number ilike $2)
        order by c.updated_at desc
        limit 5
        `,
        [organizationId, term]
      ),
      db.query(
        `
        select d.id, d.name, d.summary, d.content
        from public.documents d
        where d.organization_id = $1
          and (d.name ilike $2 or d.summary ilike $2 or d.content ilike $2)
        order by d.updated_at desc
        limit 5
        `,
        [organizationId, term]
      ),
      db.query(
        `
        select c.id, c.title, c.description, c.status, c.contract_type
        from public.contracts c
        where c.organization_id = $1
          and (c.title ilike $2 or c.description ilike $2 or c.terms ilike $2)
        order by c.updated_at desc
        limit 5
        `,
        [organizationId, term]
      ),
      db.query(
        `
        select cl.id, cl.name, cl.email, cl.phone
        from public.clients cl
        where cl.organization_id = $1
          and (cl.name ilike $2 or cl.email ilike $2 or cl.phone ilike $2)
        order by cl.updated_at desc
        limit 5
        `,
        [organizationId, term]
      ),
    ]);

    res.status(200).json({
      cases: casesResult.rows.map((item: Record<string, string | null>) => ({
        id: item.id,
        title: item.title,
        subtitle: [item.case_number ? `Case #${item.case_number}` : null, item.client_name]
          .filter(Boolean)
          .join(' • '),
        url: `/cases/${item.id}`,
        badge: item.status ? { label: item.status, variant: 'secondary' } : undefined,
      })),
      documents: documentsResult.rows.map((item: Record<string, string | null>) => ({
        id: item.id,
        title: item.name,
        subtitle: (item.summary || item.content || '')?.slice(0, 100),
        url: '/documents',
        badge: { label: 'Document', variant: 'outline' },
      })),
      contracts: contractsResult.rows.map((item: Record<string, string | null>) => ({
        id: item.id,
        title: item.title,
        subtitle: [item.contract_type, item.description].filter(Boolean).join(' • '),
        url: `/contracts/${item.id}`,
        badge: item.status
          ? {
              label: item.status,
              variant: 'secondary',
            }
          : undefined,
      })),
      clients: clientsResult.rows.map((item: Record<string, string | null>) => ({
        id: item.id,
        title: item.name,
        subtitle: [item.email, item.phone].filter(Boolean).join(' • '),
        url: `/clients/${item.id}`,
      })),
      calendarEvents: [],
      voiceRecordings: [],
      transcriptions: [],
    });
  })
);
