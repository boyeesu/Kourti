import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { escapeIlike } from '../../lib/escapeIlike.js';
import { ApiError, asyncHandler } from '../../lib/http.js';

const listContractsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(10),
  status: z.string().trim().optional(),
  clientId: z.string().uuid().optional(),
  expiringDays: z.coerce.number().int().positive().max(365).optional(),
  search: z.string().trim().optional(),
});

const contractIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const createContractBodySchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().optional(),
  content: z.string().optional(),
  status: z.string().trim().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  value: z.number().optional(),
  currency: z.string().trim().optional(),
  client_id: z.string().uuid().optional(),
  contract_type: z.string().trim().optional(),
  terms: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateContractBodySchema = createContractBodySchema.partial().extend({
  id: z.string().uuid().optional(),
});

export const contractsRouter = Router();

type ContractRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  value: number | null;
  currency: string | null;
  start_date: string | null;
  end_date: string | null;
  contract_type: string | null;
  terms: string | null;
  metadata: Record<string, unknown> | null;
  client_id: string | null;
  organization_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  client_name: string | null;
  client_email: string | null;
  client_company: string | null;
};

function mapContractRow(row: ContractRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status,
    value: row.value ?? undefined,
    currency: row.currency ?? undefined,
    start_date: row.start_date ?? undefined,
    end_date: row.end_date ?? undefined,
    contract_type: row.contract_type ?? undefined,
    terms: row.terms ?? undefined,
    metadata: row.metadata ?? undefined,
    client_id: row.client_id ?? undefined,
    organization_id: row.organization_id,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    client:
      row.client_name || row.client_email || row.client_company
        ? {
            id: row.client_id,
            name: row.client_name,
            email: row.client_email,
            company: row.client_company,
          }
        : null,
  };
}

contractsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = listContractsQuerySchema.parse(req.query);
    const page = parsed.page;
    const pageSize = parsed.pageSize;
    const status = parsed.status && parsed.status !== 'all' ? parsed.status : null;
    const clientId = parsed.clientId || null;
    const expiringDays = parsed.expiringDays || null;
    const search = parsed.search ? `%${escapeIlike(parsed.search)}%` : null;
    const organizationId = req.auth!.organizationId;

    const offset = (page - 1) * pageSize;

    const countResult = await db.query<{ count: string }>(
      `
      select count(*)::text as count
      from public.contracts c
      where c.organization_id = $1
        and ($2::text is null or c.status = $2)
        and ($3::uuid is null or c.client_id = $3)
        and (
          $4::int is null
          or (
            c.status = 'active'
            and c.end_date is not null
            and c.end_date >= now()
            and c.end_date <= (now() + ($4::text || ' days')::interval)
          )
        )
        and (
          $5::text is null
          or c.title ilike $5
          or c.description ilike $5
          or c.terms ilike $5
        )
      `,
      [organizationId, status, clientId, expiringDays, search]
    );

    const dataResult = await db.query<ContractRow>(
      `
      select
        c.id,
        c.title,
        c.description,
        c.status,
        c.value,
        c.currency,
        c.start_date,
        c.end_date,
        c.contract_type,
        c.terms,
        null as metadata,
        c.client_id,
        c.organization_id,
        c.created_by,
        c.created_at,
        c.updated_at,
        cl.name as client_name,
        cl.email as client_email,
        cl.company as client_company
      from public.contracts c
      left join public.clients cl on cl.id = c.client_id
      where c.organization_id = $1
        and ($2::text is null or c.status = $2)
        and ($3::uuid is null or c.client_id = $3)
        and (
          $4::int is null
          or (
            c.status = 'active'
            and c.end_date is not null
            and c.end_date >= now()
            and c.end_date <= (now() + ($4::text || ' days')::interval)
          )
        )
        and (
          $5::text is null
          or c.title ilike $5
          or c.description ilike $5
          or c.terms ilike $5
        )
      order by c.created_at desc
      limit $6
      offset $7
      `,
      [organizationId, status, clientId, expiringDays, search, pageSize, offset]
    );

    const contracts = dataResult.rows.map(mapContractRow);

    res.status(200).json({
      contracts,
      count: Number(countResult.rows[0]?.count ?? 0),
      page,
      pageSize,
    });
  })
);

contractsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = contractIdParamsSchema.parse(req.params);
    const organizationId = req.auth!.organizationId;

    const result = await db.query<ContractRow>(
      `
      select
        c.id,
        c.title,
        c.description,
        c.status,
        c.value,
        c.currency,
        c.start_date,
        c.end_date,
        c.contract_type,
        c.terms,
        null as metadata,
        c.client_id,
        c.organization_id,
        c.created_by,
        c.created_at,
        c.updated_at,
        cl.name as client_name,
        cl.email as client_email,
        cl.company as client_company
      from public.contracts c
      left join public.clients cl on cl.id = c.client_id
      where c.id = $1 and c.organization_id = $2
      limit 1
      `,
      [id, organizationId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new ApiError('Contract not found', 404, 'NOT_FOUND');
    }

    res.status(200).json(mapContractRow(row));
  })
);

contractsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = createContractBodySchema.parse(req.body);
    const auth = req.auth!;

    const result = await db.query<ContractRow>(
      `
      insert into public.contracts (
        title,
        description,
        content,
        status,
        start_date,
        end_date,
        value,
        currency,
        client_id,
        contract_type,
        terms,
        metadata,
        organization_id,
        created_by
      )
      values (
        $1, $2, $3, coalesce($4, 'draft'), $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14
      )
      returning
        id,
        title,
        description,
        status,
        value,
        currency,
        start_date,
        end_date,
        contract_type,
        terms,
        metadata,
        client_id,
        organization_id,
        created_by,
        created_at,
        updated_at,
        null::text as client_name,
        null::text as client_email,
        null::text as client_company
      `,
      [
        body.title,
        body.description || null,
        body.content || null,
        body.status || null,
        body.start_date || null,
        body.end_date || null,
        body.value || null,
        body.currency || null,
        body.client_id || null,
        body.contract_type || null,
        body.terms || null,
        body.metadata ? JSON.stringify(body.metadata) : null,
        auth.organizationId,
        auth.userId,
      ]
    );

    res.status(201).json(mapContractRow(result.rows[0]));
  })
);

contractsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = contractIdParamsSchema.parse(req.params);
    const updateData = updateContractBodySchema.parse(req.body);
    const organizationId = req.auth!.organizationId;

    const updates: Array<{ column: string; value: unknown }> = [
      { column: 'title', value: updateData.title },
      { column: 'description', value: updateData.description },
      { column: 'content', value: updateData.content },
      { column: 'status', value: updateData.status },
      { column: 'start_date', value: updateData.start_date },
      { column: 'end_date', value: updateData.end_date },
      { column: 'value', value: updateData.value },
      { column: 'currency', value: updateData.currency },
      { column: 'client_id', value: updateData.client_id },
      { column: 'contract_type', value: updateData.contract_type },
      { column: 'terms', value: updateData.terms },
      {
        column: 'metadata',
        value: updateData.metadata ? JSON.stringify(updateData.metadata) : undefined,
      },
    ].filter((entry) => entry.value !== undefined);

    if (!updates.length) {
      throw new ApiError('No update fields provided', 400, 'VALIDATION_ERROR');
    }

    const setClause = updates.map((entry, index) => `${entry.column} = $${index + 1}`).join(', ');
    const values = updates.map((entry) => entry.value);

    const result = await db.query<ContractRow>(
      `
      update public.contracts
      set ${setClause}, updated_at = now()
      where id = $${updates.length + 1}
        and organization_id = $${updates.length + 2}
      returning
        id,
        title,
        description,
        status,
        value,
        currency,
        start_date,
        end_date,
        contract_type,
        terms,
        metadata,
        client_id,
        organization_id,
        created_by,
        created_at,
        updated_at,
        null::text as client_name,
        null::text as client_email,
        null::text as client_company
      `,
      [...values, id, organizationId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Contract not found', 404, 'NOT_FOUND');
    }

    res.status(200).json(mapContractRow(result.rows[0]));
  })
);

contractsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = contractIdParamsSchema.parse(req.params);
    const organizationId = req.auth!.organizationId;

    const result = await db.query(
      'delete from public.contracts where id = $1 and organization_id = $2',
      [id, organizationId]
    );

    if ((result.rowCount || 0) === 0) {
      throw new ApiError('Contract not found', 404, 'NOT_FOUND');
    }

    res.status(204).send();
  })
);
