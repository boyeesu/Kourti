/**
 * Tabular review routes.
 *
 * A tabular review is a spreadsheet across N documents (rows) × M
 * columns (questions). Each cell holds a per-document LLM extraction
 * with optional citations of the form [[page:N||quote:verbatim]].
 *
 * Endpoints:
 *   GET    /                          — list reviews (optional ?caseId=)
 *   POST   /                          — create a review
 *   GET    /:reviewId                 — single review with cells + columns
 *   PATCH  /:reviewId                 — update title / columns / docs
 *   DELETE /:reviewId                 — delete review
 *   POST   /:reviewId/clear-cells     — wipe all cell content
 *   POST   /:reviewId/regenerate-cell — regenerate a single cell
 *   POST   /:reviewId/generate        — generate all empty/non-done cells
 *                                        (returns SSE stream of cell updates)
 */

import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { runWithTools, type ToolDef } from '../../lib/tools.js';
import { downloadFile } from '../../services/storage.js';
import { loadActiveVersion } from '../../lib/documentVersions.js';
import { extractDocxBodyText, normalizeDocxZipPaths } from '../../lib/docxTrackedChanges.js';

export const tabularReviewsRouter = Router();

// ─── Schemas ─────────────────────────────────────────────────────────

const columnFormatSchema = z.enum([
  'text',
  'bulleted_list',
  'number',
  'percentage',
  'monetary_amount',
  'currency',
  'yes_no',
  'date',
  'tag',
]);

const columnSchema = z.object({
  index: z.number().int().min(0),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  format: columnFormatSchema.default('text'),
  tags: z.array(z.string()).optional(),
  prompt: z.string().trim().max(4000).optional(),
});

const createReviewSchema = z.object({
  title: z.string().trim().min(1).max(200),
  caseId: z.string().uuid().nullish(),
  templateId: z.string().uuid().nullish(),
  practice: z.string().trim().max(120).optional(),
  documentIds: z.array(z.string().uuid()).default([]),
  columns: z.array(columnSchema).default([]),
});

const updateReviewSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  practice: z.string().trim().max(120).optional(),
  documentIds: z.array(z.string().uuid()).optional(),
  columns: z.array(columnSchema).optional(),
});

const reviewIdParamSchema = z.object({ reviewId: z.string().uuid() });

const regenerateCellSchema = z.object({
  documentId: z.string().uuid(),
  columnIndex: z.number().int().min(0),
});

// ─── Format → prompt-suffix table ────────────────────────────────────

function formatPromptSuffix(format: string, tags?: string[]): string {
  switch (format) {
    case 'bulleted_list':
      return ' The "summary" field MUST be a markdown bulleted list only — no prose. Each item on its own line, prefixed with "* ".';
    case 'number':
      return ' The "summary" field MUST be a single number only. No units or explanation.';
    case 'percentage':
      return ' The "summary" field MUST be a single percentage value only (e.g. 42%). No explanation.';
    case 'monetary_amount':
      return ' The "summary" field MUST be the monetary value only, including currency (e.g. $1,234.56). No explanation.';
    case 'currency':
      return ' The "summary" field MUST contain only the currency code(s). Wrap each in double square brackets, e.g. [[USD]] or [[EUR]]. No other text.';
    case 'yes_no':
      return ' The "summary" field MUST be [[Yes]] or [[No]] only. The "reasoning" field MUST include an inline citation [[page:N||quote:verbatim ≤25 words]] supporting the answer.';
    case 'date':
      return ' The "summary" field MUST be a date in DD Month YYYY format (e.g. 1 January 2024). For ranges, give both dates separated by an em dash. The "reasoning" field MUST include an inline citation [[page:N||quote:verbatim ≤25 words]].';
    case 'tag':
      return tags?.length
        ? ` The "summary" field MUST contain exactly one tag wrapped in double square brackets. Available tags: ${tags
            .map((t) => `[[${t}]]`)
            .join(
              ', '
            )}. No other text. The "reasoning" field MUST include an inline citation [[page:N||quote:verbatim ≤25 words]].`
        : '';
    default:
      return '';
  }
}

// ─── List / get / create / update / delete ──────────────────────────

tabularReviewsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const caseId = z.string().uuid().optional().parse(req.query.caseId);
    const params: unknown[] = [organizationId];
    let where = 'organization_id = $1';
    if (caseId) {
      params.push(caseId);
      where += ` and case_id = $${params.length}`;
    }
    const result = await db.query(
      `select id, title, practice, columns_config, document_ids, case_id,
              template_id, created_at, updated_at
         from public.tabular_reviews
        where ${where}
        order by updated_at desc`,
      params
    );
    res.json({ success: true, data: result.rows });
  })
);

tabularReviewsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const body = createReviewSchema.parse(req.body);

    const client = await db.connect();
    try {
      await client.query('begin');
      const reviewResult = await client.query(
        `insert into public.tabular_reviews
           (organization_id, case_id, template_id, title, practice, columns_config, document_ids, created_by)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7::uuid[], $8)
         returning *`,
        [
          organizationId,
          body.caseId ?? null,
          body.templateId ?? null,
          body.title,
          body.practice ?? null,
          JSON.stringify(body.columns),
          body.documentIds,
          userId,
        ]
      );
      const review = reviewResult.rows[0];

      // Pre-create pending cells for every (doc × column) pair.
      for (const docId of body.documentIds) {
        for (const col of body.columns) {
          await client.query(
            `insert into public.tabular_cells
               (review_id, document_id, column_index, status)
             values ($1, $2, $3, 'pending')
             on conflict (review_id, document_id, column_index) do nothing`,
            [review.id, docId, col.index]
          );
        }
      }
      await client.query('commit');
      res.status(201).json({ success: true, data: review });
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  })
);

tabularReviewsRouter.get(
  '/:reviewId',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { reviewId } = reviewIdParamSchema.parse(req.params);

    const reviewResult = await db.query(
      `select * from public.tabular_reviews where id = $1 and organization_id = $2`,
      [reviewId, organizationId]
    );
    const review = reviewResult.rows[0];
    if (!review) throw new ApiError('Review not found', 404, 'NOT_FOUND');

    const cellsResult = await db.query(
      `select id, document_id, column_index, status, content, error_message, updated_at
         from public.tabular_cells
        where review_id = $1`,
      [reviewId]
    );

    const docs = review.document_ids?.length
      ? (
          await db.query(
            `select id, name, file_path, mime_type, current_version_id
               from public.documents
              where id = any($1::uuid[]) and organization_id = $2`,
            [review.document_ids, organizationId]
          )
        ).rows
      : [];

    res.json({
      success: true,
      data: {
        review,
        columns: review.columns_config ?? [],
        documents: docs,
        cells: cellsResult.rows,
      },
    });
  })
);

tabularReviewsRouter.patch(
  '/:reviewId',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { reviewId } = reviewIdParamSchema.parse(req.params);
    const body = updateReviewSchema.parse(req.body);

    const client = await db.connect();
    try {
      await client.query('begin');
      const result = await client.query(
        `update public.tabular_reviews
            set title          = coalesce($3, title),
                practice       = coalesce($4, practice),
                columns_config = coalesce($5::jsonb, columns_config),
                document_ids   = coalesce($6::uuid[], document_ids),
                updated_at     = now()
          where id = $1 and organization_id = $2
          returning *`,
        [
          reviewId,
          organizationId,
          body.title ?? null,
          body.practice ?? null,
          body.columns ? JSON.stringify(body.columns) : null,
          body.documentIds ?? null,
        ]
      );
      const review = result.rows[0];
      if (!review) throw new ApiError('Review not found', 404, 'NOT_FOUND');

      // Reconcile cells if columns or documents changed.
      if (body.columns || body.documentIds) {
        const cols = (review.columns_config ?? []) as Array<{ index: number }>;
        const docIds = (review.document_ids ?? []) as string[];
        for (const docId of docIds) {
          for (const col of cols) {
            await client.query(
              `insert into public.tabular_cells
                 (review_id, document_id, column_index, status)
               values ($1, $2, $3, 'pending')
               on conflict (review_id, document_id, column_index) do nothing`,
              [reviewId, docId, col.index]
            );
          }
        }
        // Delete cells whose column / document is no longer in scope.
        if (cols.length > 0 && docIds.length > 0) {
          await client.query(
            `delete from public.tabular_cells
              where review_id = $1
                and (column_index <> all($2::int[]) or document_id <> all($3::uuid[]))`,
            [reviewId, cols.map((c) => c.index), docIds]
          );
        }
      }

      await client.query('commit');
      res.json({ success: true, data: review });
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  })
);

tabularReviewsRouter.delete(
  '/:reviewId',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { reviewId } = reviewIdParamSchema.parse(req.params);
    const result = await db.query(
      `delete from public.tabular_reviews
        where id = $1 and organization_id = $2 returning id`,
      [reviewId, organizationId]
    );
    if (!result.rows[0]) throw new ApiError('Review not found', 404, 'NOT_FOUND');
    res.json({ success: true, data: { deleted: true } });
  })
);

tabularReviewsRouter.post(
  '/:reviewId/clear-cells',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { reviewId } = reviewIdParamSchema.parse(req.params);
    const owns = await db.query<{ id: string }>(
      `select id from public.tabular_reviews where id = $1 and organization_id = $2`,
      [reviewId, organizationId]
    );
    if (!owns.rows[0]) throw new ApiError('Review not found', 404, 'NOT_FOUND');
    await db.query(
      `update public.tabular_cells
          set content = null, status = 'pending', error_message = null, updated_at = now()
        where review_id = $1`,
      [reviewId]
    );
    res.json({ success: true, data: { cleared: true } });
  })
);

// ─── Per-cell extraction ────────────────────────────────────────────

interface ColumnConfig {
  index: number;
  name: string;
  description?: string;
  format?: string;
  tags?: string[];
  prompt?: string;
}

interface CellOutput {
  summary: string;
  flag?: 'green' | 'grey' | 'yellow' | 'red';
  reasoning?: string;
}

async function loadDocumentText(
  documentId: string,
  organizationId: string
): Promise<{ name: string; text: string } | null> {
  const docRes = await db.query<{ name: string; mime_type: string | null }>(
    `select name, mime_type from public.documents where id = $1 and organization_id = $2`,
    [documentId, organizationId]
  );
  const doc = docRes.rows[0];
  if (!doc) return null;
  const active = await loadActiveVersion(documentId, organizationId);
  if (!active) return null;
  const file = await downloadFile('documents', active.storage_path);
  const isDocx =
    active.mime_type ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    active.storage_path.toLowerCase().endsWith('.docx');
  if (isDocx) {
    const normalized = await normalizeDocxZipPaths(file.data);
    return { name: doc.name, text: await extractDocxBodyText(normalized) };
  }
  // For .txt or anything plain-text-ish, treat the bytes as utf8.
  return { name: doc.name, text: file.data.toString('utf8') };
}

const CELL_SYSTEM_PROMPT = `You are extracting a single column value from a single legal document into a structured table.

Flag meanings:
- green = standard / expected
- grey  = neutral / informational
- yellow = noteworthy / non-market
- red   = critical issue or red flag

If the answer is not present in the document, set summary to "N/A" and flag to "grey".

You MUST call the record_cell tool exactly once with the extracted value.`;

const RECORD_CELL_TOOL: ToolDef = {
  name: 'record_cell',
  description: 'Record the extracted cell value for the requested column.',
  parameters: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'The cell value, formatted per the column format suffix in the user prompt.',
      },
      flag: {
        type: 'string',
        enum: ['green', 'grey', 'yellow', 'red'],
        description: 'Significance flag — see system prompt for meanings.',
      },
      reasoning: {
        type: 'string',
        description:
          'Short explanation of how the value was derived. May include inline citations of the form [[page:N||quote:verbatim ≤25 words]].',
      },
    },
    required: ['summary', 'flag'],
  },
};

function buildCellUserPrompt(column: ColumnConfig, doc: { name: string; text: string }): string {
  const truncated = doc.text.length > 60_000 ? doc.text.slice(0, 60_000) : doc.text;
  const formatSuffix = formatPromptSuffix(column.format ?? 'text', column.tags);
  const customPrompt = column.prompt ? `\n\nADDITIONAL INSTRUCTION:\n${column.prompt}` : '';
  return `COLUMN: ${column.name}
DESCRIPTION: ${column.description ?? '(none)'}${customPrompt}${formatSuffix}

DOCUMENT NAME: ${doc.name}
DOCUMENT TEXT (paragraphs joined by \\n):
${truncated}`;
}

function coerceCellArgs(args: Record<string, unknown>): CellOutput {
  return {
    summary: typeof args.summary === 'string' ? args.summary : '',
    flag: (args.flag as CellOutput['flag']) ?? 'grey',
    reasoning: typeof args.reasoning === 'string' ? args.reasoning : undefined,
  };
}

async function extractCell(
  reviewId: string,
  documentId: string,
  columnIndex: number,
  organizationId: string
) {
  const reviewResult = await db.query(
    `select columns_config from public.tabular_reviews where id = $1 and organization_id = $2`,
    [reviewId, organizationId]
  );
  const review = reviewResult.rows[0];
  if (!review) throw new ApiError('Review not found', 404, 'NOT_FOUND');
  const columns = (review.columns_config ?? []) as ColumnConfig[];
  const column = columns.find((c) => c.index === columnIndex);
  if (!column) throw new ApiError('Column not found', 404, 'COLUMN_NOT_FOUND');

  await db.query(
    `update public.tabular_cells
        set status = 'generating', error_message = null, updated_at = now()
      where review_id = $1 and document_id = $2 and column_index = $3`,
    [reviewId, documentId, columnIndex]
  );

  try {
    const doc = await loadDocumentText(documentId, organizationId);
    if (!doc) throw new ApiError('Document not found or unreadable', 404, 'DOCUMENT_UNREADABLE');

    const result = await runWithTools(
      [
        { role: 'system', content: CELL_SYSTEM_PROMPT },
        { role: 'user', content: buildCellUserPrompt(column, doc) },
      ],
      [RECORD_CELL_TOOL],
      { forceTool: 'record_cell', maxTokens: 2000 }
    );
    if (result.kind !== 'tool_call') {
      throw new ApiError('LLM did not call record_cell', 502, 'LLM_NO_TOOL_CALL');
    }
    const cell = coerceCellArgs(result.args);

    const updated = await db.query(
      `update public.tabular_cells
          set status = 'done', content = $4::jsonb, error_message = null, updated_at = now()
        where review_id = $1 and document_id = $2 and column_index = $3
        returning *`,
      [reviewId, documentId, columnIndex, JSON.stringify(cell)]
    );
    return updated.rows[0];
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const updated = await db.query(
      `update public.tabular_cells
          set status = 'error', error_message = $4, updated_at = now()
        where review_id = $1 and document_id = $2 and column_index = $3
        returning *`,
      [reviewId, documentId, columnIndex, message.slice(0, 500)]
    );
    return updated.rows[0];
  }
}

tabularReviewsRouter.post(
  '/:reviewId/regenerate-cell',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { reviewId } = reviewIdParamSchema.parse(req.params);
    const body = regenerateCellSchema.parse(req.body);
    const cell = await extractCell(reviewId, body.documentId, body.columnIndex, organizationId);
    res.json({ success: true, data: cell });
  })
);

// SSE generation stream — extracts every pending/non-done cell and pushes
// updates as `data: {...}\n\n` lines.
tabularReviewsRouter.post(
  '/:reviewId/generate',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { reviewId } = reviewIdParamSchema.parse(req.params);

    const ownsResult = await db.query(
      `select id from public.tabular_reviews where id = $1 and organization_id = $2`,
      [reviewId, organizationId]
    );
    if (!ownsResult.rows[0]) throw new ApiError('Review not found', 404, 'NOT_FOUND');

    const cellsResult = await db.query<{ document_id: string; column_index: number }>(
      `select document_id, column_index
         from public.tabular_cells
        where review_id = $1 and status <> 'done'`,
      [reviewId]
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (event: unknown) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    send({ type: 'start', total: cellsResult.rows.length });

    // Sequential — could be parallelised but kept simple to avoid LLM
    // rate-limits and to keep token budget predictable.
    for (const target of cellsResult.rows) {
      try {
        const cell = await extractCell(
          reviewId,
          target.document_id,
          target.column_index,
          organizationId
        );
        send({ type: 'cell', cell });
      } catch (err) {
        send({
          type: 'error',
          documentId: target.document_id,
          columnIndex: target.column_index,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    send({ type: 'done' });
    res.end();
  })
);
