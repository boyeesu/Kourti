import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { recordCaseEvent } from '../../services/caseEvents.js';
import { escapeIlike } from '../../lib/escapeIlike.js';
import { sanitizeHtml } from '../../lib/sanitizeHtml.js';
import { createSignedUrl } from '../../services/storage.js';

const listDocumentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(50),
  search: z.string().trim().optional(),
  clientId: z.string().uuid().optional(),
  caseId: z.string().uuid().optional(),
});

const documentIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const documentSignedUrlQuerySchema = z.object({
  expiresIn: z.coerce.number().int().min(30).max(3600).default(300),
  disposition: z.enum(['inline', 'attachment']).default('inline'),
  filename: z.string().trim().min(1).max(255).optional(),
});

const createDocumentBodySchema = z.object({
  name: z.string().trim().min(1),
  content: z.string(),
  summary: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  effective_date: z.string().optional(),
  renewal_date: z.string().optional(),
  termination_date: z.string().optional(),
  value: z.number().optional(),
  contract_type: z.string().trim().optional(),
  currency: z.string().trim().optional(),
  terms: z.string().optional(),
  file_path: z.string().optional(),
  file_size: z.number().int().nonnegative().optional(),
  mime_type: z.string().optional(),
  // SHA-256 of the uploaded bytes, captured by POST /files/documents/upload
  // and forwarded so we can verify integrity on every later read.
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/i)
    .optional(),
  client_id: z.string().uuid().optional(),
});

const updateDocumentBodySchema = createDocumentBodySchema.partial().extend({
  id: z.string().uuid().optional(),
});

export const documentsRouter = Router();

type DocumentFileRow = {
  id: string;
  name: string;
  file_path: string | null;
  mime_type: string | null;
  file_size: number | null;
  metadata: Record<string, unknown> | null;
};

async function getAuthorizedDocumentFile(
  id: string,
  organizationId: string
): Promise<DocumentFileRow & { file_path: string }> {
  const result = await db.query<DocumentFileRow>(
    `
    select id, name, file_path, mime_type, file_size, metadata
    from public.documents
    where id = $1 and organization_id = $2 and deleted_at is null
    limit 1
    `,
    [id, organizationId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new ApiError('Document not found', 404, 'NOT_FOUND');
  }

  if (!row.file_path) {
    throw new ApiError('Document file is not available', 409, 'FILE_NOT_AVAILABLE');
  }

  if (!row.file_path.startsWith(`${organizationId}/`)) {
    throw new ApiError('Invalid file path for organization', 403, 'FORBIDDEN_FILE_PATH');
  }

  return {
    ...row,
    file_path: row.file_path,
  };
}

type DocumentRow = {
  id: string;
  name: string;
  content: string;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  effective_date: string | null;
  renewal_date: string | null;
  termination_date: string | null;
  value: number | null;
  contract_type: string | null;
  currency: string | null;
  terms: string | null;
  file_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  storage_status: 'present' | 'missing';
  client_id: string | null;
  organization_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  client_name: string | null;
  profile_first_name: string | null;
  profile_last_name: string | null;
  case_id: string | null;
  case_title: string | null;
};

function mapDocumentRow(row: DocumentRow) {
  return {
    id: row.id,
    name: row.name,
    title: row.name,
    content: row.content,
    summary: row.summary,
    metadata: row.metadata,
    effective_date: row.effective_date,
    renewal_date: row.renewal_date,
    termination_date: row.termination_date,
    value: row.value,
    contract_type: row.contract_type,
    currency: row.currency,
    terms: row.terms,
    file_path: row.file_path,
    file_size: row.file_size,
    file_type: row.file_path?.split('.').pop() || null,
    mime_type: row.mime_type,
    storage_status: row.storage_status,
    client_id: row.client_id,
    organization_id: row.organization_id,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    clients: row.client_id
      ? {
          id: row.client_id,
          name: row.client_name,
        }
      : null,
    profiles:
      row.profile_first_name || row.profile_last_name
        ? {
            first_name: row.profile_first_name,
            last_name: row.profile_last_name,
          }
        : null,
    case:
      row.case_id && row.case_title
        ? {
            id: row.case_id,
            title: row.case_title,
          }
        : null,
  };
}

function getDocumentsSelectSql() {
  return `
    select
      d.id,
      d.name,
      d.content,
      d.summary,
      d.metadata,
      d.effective_date,
      d.renewal_date,
      d.termination_date,
      d.value,
      d.contract_type,
      d.currency,
      d.terms,
      d.file_path,
      d.file_size,
      d.mime_type,
      d.storage_status,
      d.client_id,
      d.organization_id,
      d.created_by,
      d.created_at,
      d.updated_at,
      cl.name as client_name,
      p.first_name as profile_first_name,
      p.last_name as profile_last_name,
      c.id as case_id,
      c.title as case_title
    from public.documents d
    left join public.clients cl on cl.id = d.client_id
    left join public.profiles p on p.user_id = d.created_by
    left join public.cases c on c.id::text = d.metadata->>'case_id'
  `;
}

documentsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = listDocumentsQuerySchema.parse(req.query);
    const page = parsed.page;
    const pageSize = parsed.pageSize;
    const search = parsed.search ? `%${escapeIlike(parsed.search)}%` : null;
    const clientId = parsed.clientId || null;
    const caseId = parsed.caseId || null;
    const organizationId = req.auth!.organizationId;
    const offset = (page - 1) * pageSize;

    const whereClause = `
      where d.organization_id = $1
        and d.deleted_at is null
        and (
          $2::text is null
          or d.name ilike $2
          or d.summary ilike $2
          or d.content ilike $2
        )
        and ($3::uuid is null or d.client_id = $3)
        and ($4::uuid is null or d.metadata->>'case_id' = $4::text)
    `;

    const countResult = await db.query<{ count: string }>(
      `
      select count(*)::text as count
      from public.documents d
      ${whereClause}
      `,
      [organizationId, search, clientId, caseId]
    );

    const dataResult = await db.query<DocumentRow>(
      `
      ${getDocumentsSelectSql()}
      ${whereClause}
      order by d.created_at desc
      limit $5
      offset $6
      `,
      [organizationId, search, clientId, caseId, pageSize, offset]
    );

    res.status(200).json({
      documents: dataResult.rows.map(mapDocumentRow),
      count: Number(countResult.rows[0]?.count ?? 0),
      page,
      pageSize,
    });
  })
);

documentsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = documentIdParamsSchema.parse(req.params);
    const organizationId = req.auth!.organizationId;

    const result = await db.query<DocumentRow>(
      `
      ${getDocumentsSelectSql()}
      where d.id = $1 and d.organization_id = $2 and d.deleted_at is null
      limit 1
      `,
      [id, organizationId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new ApiError('Document not found', 404, 'NOT_FOUND');
    }

    res.status(200).json(mapDocumentRow(row));
  })
);

documentsRouter.get(
  '/:id/signed-url',
  asyncHandler(async (req, res) => {
    const { id } = documentIdParamsSchema.parse(req.params);
    const { expiresIn, disposition, filename } = documentSignedUrlQuerySchema.parse(req.query);
    const organizationId = req.auth!.organizationId;

    const document = await getAuthorizedDocumentFile(id, organizationId);

    const originalFilename =
      filename ||
      (typeof document.metadata?.original_filename === 'string'
        ? document.metadata.original_filename
        : document.name);

    const safeFilename = originalFilename.replace(/[\r\n/\\]+/g, '_');

    const signedUrl = createSignedUrl('documents', document.file_path, expiresIn, organizationId);

    res.status(200).json({
      signedUrl,
      expiresIn,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      fileName: safeFilename,
      mimeType: document.mime_type,
      fileSize: document.file_size,
      disposition,
    });
  })
);

documentsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = createDocumentBodySchema.parse(req.body);
    const auth = req.auth!;

    // Storage cap is enforced at upload time (POST /files/documents/upload)
    // using the real uploaded byte count — not the client-reported file_size
    // here, which could be under-reported to bypass the cap.

    const result = await db.query<DocumentRow>(
      `
      insert into public.documents (
        name,
        content,
        summary,
        metadata,
        effective_date,
        renewal_date,
        termination_date,
        value,
        contract_type,
        currency,
        terms,
        file_path,
        file_size,
        mime_type,
        sha256,
        client_id,
        organization_id,
        created_by
      )
      values (
        $1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
      )
      returning
        id,
        name,
        content,
        summary,
        metadata,
        effective_date,
        renewal_date,
        termination_date,
        value,
        contract_type,
        currency,
        terms,
        file_path,
        file_size,
        mime_type,
        client_id,
        organization_id,
        created_by,
        created_at,
        updated_at,
        null::text as client_name,
        null::text as profile_first_name,
        null::text as profile_last_name,
        null::uuid as case_id,
        null::text as case_title
      `,
      [
        body.name,
        body.content,
        body.summary || null,
        body.metadata ? JSON.stringify(body.metadata) : null,
        body.effective_date || null,
        body.renewal_date || null,
        body.termination_date || null,
        body.value || null,
        body.contract_type || null,
        body.currency || null,
        body.terms || null,
        body.file_path || null,
        body.file_size || null,
        body.mime_type || null,
        body.sha256 || null,
        body.client_id || null,
        auth.organizationId,
        auth.userId,
      ]
    );

    const newDoc = result.rows[0];

    // Resolve case_id from metadata only when explicitly provided and unambiguous.
    // documents has no case_id column; the case relationship lives in metadata->>'case_id'.
    const metaCaseId =
      body.metadata && typeof body.metadata['case_id'] === 'string' && body.metadata['case_id']
        ? (body.metadata['case_id'] as string)
        : null;

    if (metaCaseId) {
      await recordCaseEvent({
        organizationId: auth.organizationId,
        caseId: metaCaseId,
        eventType: 'document_added',
        title: newDoc.name,
        actorType: 'staff',
        actorId: auth.userId,
      });
    }
    // TODO v2: resolve case for document event when document is linked only via client_id (ambiguous — a client may have multiple cases)

    res.status(201).json(mapDocumentRow(newDoc));
  })
);

documentsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = documentIdParamsSchema.parse(req.params);
    const updateData = updateDocumentBodySchema.parse(req.body);
    const organizationId = req.auth!.organizationId;

    // Server-side HTML sanitisation (defence-in-depth; client uses DOMPurify)
    const sanitizedContent =
      updateData.content != null ? sanitizeHtml(updateData.content) : updateData.content;

    const updates: Array<{ column: string; value: unknown; isJson?: boolean }> = [
      { column: 'name', value: updateData.name },
      { column: 'content', value: sanitizedContent },
      { column: 'summary', value: updateData.summary },
      {
        column: 'metadata',
        value: updateData.metadata ? JSON.stringify(updateData.metadata) : undefined,
        isJson: true,
      },
      { column: 'effective_date', value: updateData.effective_date },
      { column: 'renewal_date', value: updateData.renewal_date },
      { column: 'termination_date', value: updateData.termination_date },
      { column: 'value', value: updateData.value },
      { column: 'contract_type', value: updateData.contract_type },
      { column: 'currency', value: updateData.currency },
      { column: 'terms', value: updateData.terms },
      { column: 'file_path', value: updateData.file_path },
      { column: 'file_size', value: updateData.file_size },
      { column: 'mime_type', value: updateData.mime_type },
      { column: 'client_id', value: updateData.client_id },
    ].filter((entry) => entry.value !== undefined);

    if (!updates.length) {
      throw new ApiError('No update fields provided', 400, 'VALIDATION_ERROR');
    }

    const setClause = updates
      .map((entry, index) => `${entry.column} = $${index + 1}${entry.isJson ? '::jsonb' : ''}`)
      .join(', ');
    const values = updates.map((entry) => entry.value);

    const result = await db.query<DocumentRow>(
      `
      update public.documents
      set ${setClause}, updated_at = now()
      where id = $${updates.length + 1}
        and organization_id = $${updates.length + 2}
        and deleted_at is null
      returning
        id,
        name,
        content,
        summary,
        metadata,
        effective_date,
        renewal_date,
        termination_date,
        value,
        contract_type,
        currency,
        terms,
        file_path,
        file_size,
        mime_type,
        client_id,
        organization_id,
        created_by,
        created_at,
        updated_at,
        null::text as client_name,
        null::text as profile_first_name,
        null::text as profile_last_name,
        null::uuid as case_id,
        null::text as case_title
      `,
      [...values, id, organizationId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Document not found', 404, 'NOT_FOUND');
    }

    res.status(200).json(mapDocumentRow(result.rows[0]));
  })
);

documentsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = documentIdParamsSchema.parse(req.params);
    const organizationId = req.auth!.organizationId;

    // Soft-delete: stamp deleted_at so list/get queries hide the row
    // immediately, but the underlying bytes and metadata stay around
    // for the admin sweeper to hard-delete in N days. Recoverable
    // until the sweeper runs against this row's tombstone.
    const result = await db.query(
      `update public.documents
          set deleted_at = now(),
              updated_at = now()
        where id = $1 and organization_id = $2 and deleted_at is null`,
      [id, organizationId]
    );

    if ((result.rowCount || 0) === 0) {
      throw new ApiError('Document not found', 404, 'NOT_FOUND');
    }

    res.status(204).send();
  })
);
