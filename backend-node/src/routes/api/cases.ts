import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';

const listCasesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(10),
  status: z.string().trim().optional(),
  priority: z.string().trim().optional(),
  clientId: z.string().uuid().optional(),
});

const caseIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const optionalUuid = z
  .union([z.string().uuid(), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v ? v : undefined));
const optionalString = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v == null ? undefined : v.trim() || undefined));

const createCaseBodySchema = z.object({
  title: z.string().trim().min(1),
  description: optionalString,
  client_id: optionalUuid,
  status: optionalString,
  priority: optionalString,
  case_type_id: optionalUuid,
  case_issue_id: optionalUuid,
  court: optionalString,
  next_hearing_date: optionalString,
  assigned_to: optionalUuid,
  custom_fields: z
    .record(z.string(), z.unknown())
    .nullish()
    .transform((v) => v ?? undefined),
});

const updateCaseBodySchema = createCaseBodySchema.partial().extend({
  id: z.string().uuid().optional(),
});

export const casesRouter = Router();

type CaseRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  client_id: string | null;
  organization_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  next_hearing_date: string | null;
  case_type_id: string | null;
  case_issue_id: string | null;
  assigned_to: string | null;
  custom_fields: Record<string, unknown> | null;
  court: string | null;
  client_name: string | null;
  client_email: string | null;
  client_company: string | null;
};

function mapCaseRow(row: CaseRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    client_id: row.client_id,
    organization_id: row.organization_id,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    next_hearing_date: row.next_hearing_date,
    case_type_id: row.case_type_id,
    case_issue_id: row.case_issue_id,
    assigned_to: row.assigned_to,
    custom_fields: row.custom_fields,
    court: row.court,
    client:
      row.client_name || row.client_email || row.client_company
        ? {
            id: row.client_id,
            name: row.client_name,
            email: row.client_email,
            company: row.client_company,
          }
        : null,
    assigned_user: null,
    case_type: null,
    case_issue: null,
  };
}

casesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = listCasesQuerySchema.parse(req.query);
    const page = parsed.page;
    const pageSize = parsed.pageSize;
    const status = parsed.status && parsed.status !== 'all' ? parsed.status : null;
    const priority = parsed.priority && parsed.priority !== 'all' ? parsed.priority : null;
    const clientId = parsed.clientId || null;
    const organizationId = req.auth!.organizationId;
    const offset = (page - 1) * pageSize;

    const countResult = await db.query<{ count: string }>(
      `
      select count(*)::text as count
      from public.cases c
      where c.organization_id = $1
        and ($2::text is null or c.status = $2)
        and ($3::text is null or c.priority = $3)
        and ($4::uuid is null or c.client_id = $4)
      `,
      [organizationId, status, priority, clientId]
    );

    const dataResult = await db.query<CaseRow>(
      `
      select
        c.id,
        c.title,
        c.description,
        c.status,
        c.priority,
        c.client_id,
        c.organization_id,
        c.created_by,
        c.created_at,
        c.updated_at,
        c.next_hearing_date,
        c.case_type_id,
        c.case_issue_id,
        c.assigned_to,
        c.custom_fields,
        c.court,
        cl.name as client_name,
        cl.email as client_email,
        cl.company as client_company
      from public.cases c
      left join public.clients cl on cl.id = c.client_id
      where c.organization_id = $1
        and ($2::text is null or c.status = $2)
        and ($3::text is null or c.priority = $3)
        and ($4::uuid is null or c.client_id = $4)
      order by c.created_at desc
      limit $5
      offset $6
      `,
      [organizationId, status, priority, clientId, pageSize, offset]
    );

    const cases = dataResult.rows.map(mapCaseRow);

    res.status(200).json({
      cases,
      count: Number(countResult.rows[0]?.count ?? 0),
      page,
      pageSize,
    });
  })
);

casesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = caseIdParamsSchema.parse(req.params);
    const organizationId = req.auth!.organizationId;

    const result = await db.query<CaseRow>(
      `
      select
        c.id,
        c.title,
        c.description,
        c.status,
        c.priority,
        c.client_id,
        c.organization_id,
        c.created_by,
        c.created_at,
        c.updated_at,
        c.next_hearing_date,
        c.case_type_id,
        c.case_issue_id,
        c.assigned_to,
        c.custom_fields,
        c.court,
        cl.name as client_name,
        cl.email as client_email,
        cl.company as client_company
      from public.cases c
      left join public.clients cl on cl.id = c.client_id
      where c.id = $1 and c.organization_id = $2
      limit 1
      `,
      [id, organizationId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new ApiError('Case not found', 404, 'NOT_FOUND');
    }

    res.status(200).json(mapCaseRow(row));
  })
);

casesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = createCaseBodySchema.parse(req.body);
    const auth = req.auth!;

    const result = await db.query<CaseRow>(
      `
      insert into public.cases (
        title,
        description,
        client_id,
        status,
        priority,
        case_type_id,
        case_issue_id,
        court,
        next_hearing_date,
        assigned_to,
        custom_fields,
        organization_id,
        created_by
      )
      values (
        $1,
        $2,
        $3,
        coalesce($4, 'open'),
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11::jsonb,
        $12,
        $13
      )
      returning
        id,
        title,
        description,
        status,
        priority,
        client_id,
        organization_id,
        created_by,
        created_at,
        updated_at,
        next_hearing_date,
        case_type_id,
        case_issue_id,
        assigned_to,
        custom_fields,
        court,
        null::text as client_name,
        null::text as client_email,
        null::text as client_company
      `,
      [
        body.title,
        body.description || null,
        body.client_id || null,
        body.status || null,
        body.priority || null,
        body.case_type_id || null,
        body.case_issue_id || null,
        body.court || null,
        body.next_hearing_date || null,
        body.assigned_to || null,
        body.custom_fields ? JSON.stringify(body.custom_fields) : null,
        auth.organizationId,
        auth.userId,
      ]
    );

    res.status(201).json(mapCaseRow(result.rows[0]));
  })
);

casesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = caseIdParamsSchema.parse(req.params);
    const updateData = updateCaseBodySchema.parse(req.body);
    const organizationId = req.auth!.organizationId;

    const updates: Array<{ column: string; value: unknown }> = [
      { column: 'title', value: updateData.title },
      { column: 'description', value: updateData.description },
      { column: 'client_id', value: updateData.client_id },
      { column: 'status', value: updateData.status },
      { column: 'priority', value: updateData.priority },
      { column: 'case_type_id', value: updateData.case_type_id },
      { column: 'case_issue_id', value: updateData.case_issue_id },
      { column: 'court', value: updateData.court },
      { column: 'next_hearing_date', value: updateData.next_hearing_date },
      { column: 'assigned_to', value: updateData.assigned_to },
      {
        column: 'custom_fields',
        value: updateData.custom_fields ? JSON.stringify(updateData.custom_fields) : undefined,
      },
    ].filter((entry) => entry.value !== undefined);

    if (!updates.length) {
      throw new ApiError('No update fields provided', 400, 'VALIDATION_ERROR');
    }

    const setClause = updates.map((entry, index) => `${entry.column} = $${index + 1}`).join(', ');
    const values = updates.map((entry) => entry.value);

    const result = await db.query<CaseRow>(
      `
      update public.cases
      set ${setClause}, updated_at = now()
      where id = $${updates.length + 1}
        and organization_id = $${updates.length + 2}
      returning
        id,
        title,
        description,
        status,
        priority,
        client_id,
        organization_id,
        created_by,
        created_at,
        updated_at,
        next_hearing_date,
        case_type_id,
        case_issue_id,
        assigned_to,
        custom_fields,
        court,
        null::text as client_name,
        null::text as client_email,
        null::text as client_company
      `,
      [...values, id, organizationId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Case not found', 404, 'NOT_FOUND');
    }

    res.status(200).json(mapCaseRow(result.rows[0]));
  })
);

casesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = caseIdParamsSchema.parse(req.params);
    const organizationId = req.auth!.organizationId;

    const result = await db.query(
      'delete from public.cases where id = $1 and organization_id = $2',
      [id, organizationId]
    );

    if ((result.rowCount || 0) === 0) {
      throw new ApiError('Case not found', 404, 'NOT_FOUND');
    }

    res.status(204).send();
  })
);
