import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { enforceCountLimit } from '../../services/limits.js';
import { recordCaseEvent } from '../../services/caseEvents.js';
import { logSecurityEvent, eventContextFromRequest } from '../../services/securityEvents.js';

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
  portal_private: z.boolean().optional(),
  custom_fields: z
    .record(z.string(), z.unknown())
    .nullish()
    .transform((v) => v ?? undefined),
});

const updateCaseBodySchema = createCaseBodySchema.partial().extend({
  id: z.string().uuid().optional(),
});

export const casesRouter = Router();

/**
 * Cross-org reference guard (IDOR / data-integrity). Bodies accept client_id /
 * assigned_to ids the caller could point at rows in another organization.
 * Verify each referenced row belongs to the caller's org before insert/update.
 */
async function assertClientInOrg(
  clientId: string | undefined,
  organizationId: string
): Promise<void> {
  if (!clientId) return;
  const res = await db.query(
    'select 1 from public.clients where id = $1 and organization_id = $2 limit 1',
    [clientId, organizationId]
  );
  if (!res.rows[0]) {
    throw new ApiError(
      'Referenced client does not belong to your organization',
      400,
      'INVALID_REFERENCE'
    );
  }
}

async function assertAssigneeInOrg(
  userId: string | undefined,
  organizationId: string
): Promise<void> {
  if (!userId) return;
  const res = await db.query(
    `select 1
       from public.profiles
      where user_id = $1 and organization_id = $2
      union all
      select 1
       from public.user_role_assignments
      where user_id = $1 and organization_id = $2
      limit 1`,
    [userId, organizationId]
  );
  if (!res.rows[0]) {
    throw new ApiError(
      'Assigned user does not belong to your organization',
      400,
      'INVALID_REFERENCE'
    );
  }
}

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
  portal_private: boolean | null;
  client_summary: string | null;
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
    portal_private: row.portal_private,
    client_summary: row.client_summary,
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
        c.portal_private,
        c.client_summary,
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
        c.portal_private,
        c.client_summary,
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

    // Block cross-org references before inserting.
    await assertClientInOrg(body.client_id, auth.organizationId);
    await assertAssigneeInOrg(body.assigned_to, auth.organizationId);

    // Tiered plan cap on ACTIVE matters only — closed/archived matters are just
    // historical records and must not consume the cap.
    const countRes = await db.query<{ c: number }>(
      `select count(*)::int as c from public.cases
        where organization_id = $1
          and coalesce(lower(status), '') not in ('closed', 'archived')`,
      [auth.organizationId]
    );
    await enforceCountLimit(
      auth.organizationId,
      'cases',
      countRes.rows[0]?.c ?? 0,
      'active matters',
      auth.userId
    );

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
        portal_private,
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
        coalesce($11, true),
        $12::jsonb,
        $13,
        $14
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
        portal_private,
        client_summary,
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
        body.portal_private ?? null,
        body.custom_fields ? JSON.stringify(body.custom_fields) : null,
        auth.organizationId,
        auth.userId,
      ]
    );

    const newCase = result.rows[0];

    await recordCaseEvent({
      organizationId: auth.organizationId,
      caseId: newCase.id,
      eventType: 'case_created',
      title: newCase.title,
      actorType: 'staff',
      actorId: auth.userId,
    });

    res.status(201).json(mapCaseRow(newCase));
  })
);

casesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = caseIdParamsSchema.parse(req.params);
    const updateData = updateCaseBodySchema.parse(req.body);
    const organizationId = req.auth!.organizationId;
    const auth = req.auth!;

    // Block cross-org references before updating.
    await assertClientInOrg(updateData.client_id, organizationId);
    await assertAssigneeInOrg(updateData.assigned_to, organizationId);

    // Capture current values before the update so we can detect changes.
    const preResult = await db.query<{ status: string; next_hearing_date: string | null }>(
      'select status, next_hearing_date from public.cases where id = $1 and organization_id = $2 limit 1',
      [id, organizationId]
    );
    const preRow = preResult.rows[0];

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
      { column: 'portal_private', value: updateData.portal_private },
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
        portal_private,
        client_summary,
        null::text as client_name,
        null::text as client_email,
        null::text as client_company
      `,
      [...values, id, organizationId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Case not found', 404, 'NOT_FOUND');
    }

    const updatedCase = result.rows[0];

    // Emit status_changed if the status field actually changed.
    if (preRow && updateData.status !== undefined && updateData.status !== preRow.status) {
      await recordCaseEvent({
        organizationId,
        caseId: id,
        eventType: 'status_changed',
        body: `Status changed to ${updateData.status}`,
        payload: { from: preRow.status, to: updateData.status },
        actorType: 'staff',
        actorId: auth.userId,
      });
    }

    // Emit hearing_scheduled if next_hearing_date changed to a non-null value.
    if (
      preRow &&
      updateData.next_hearing_date !== undefined &&
      updateData.next_hearing_date !== null &&
      updateData.next_hearing_date !== preRow.next_hearing_date
    ) {
      await recordCaseEvent({
        organizationId,
        caseId: id,
        eventType: 'hearing_scheduled',
        payload: { date: updateData.next_hearing_date },
        actorType: 'staff',
        actorId: auth.userId,
      });
    }

    res.status(200).json(mapCaseRow(updatedCase));
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

    void logSecurityEvent({
      eventType: 'case_deleted',
      severity: 'warning',
      ...eventContextFromRequest(req),
      targetType: 'case',
      targetId: id,
    });

    res.status(204).send();
  })
);
