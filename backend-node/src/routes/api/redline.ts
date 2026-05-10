/**
 * DOCX redline routes.
 *
 *   POST /api/v1/redline/:documentId/propose
 *     Asks the LLM for tracked-change edits against the active version
 *     of the document, applies them as w:ins/w:del wrappers, writes a new
 *     document_version (source = 'assistant_edit'), creates document_edits
 *     rows, and returns them.
 *
 *   POST /api/v1/redline/:documentId/edits/:editId/accept
 *   POST /api/v1/redline/:documentId/edits/:editId/reject
 *     Resolves a single tracked change by w:id, writes a new version
 *     (source = 'user_accept' / 'user_reject'), and marks the edit row.
 */

import { Router } from 'express';
import { z } from 'zod';
import path from 'node:path';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { runWithTools, type ToolDef } from '../../lib/tools.js';
import {
  applyTrackedEdits,
  extractDocxBodyText,
  resolveTrackedChange,
  normalizeDocxZipPaths,
  type EditInput,
} from '../../lib/docxTrackedChanges.js';
import { downloadFile, uploadFile, createSignedUrl } from '../../services/storage.js';
import { createVersion, loadActiveVersion } from '../../lib/documentVersions.js';

export const redlineRouter = Router();

const documentIdParamSchema = z.object({ documentId: z.string().uuid() });
const editIdParamSchema = z.object({
  documentId: z.string().uuid(),
  editId: z.string().uuid(),
});

const proposeBodySchema = z.object({
  /** Free-text instruction to the LLM, e.g. "tighten ambiguous language" */
  instruction: z.string().trim().min(1).max(4000),
  /** Optional: limit max number of edits the model can return */
  maxEdits: z.number().int().min(1).max(40).default(15),
});

const SYSTEM_PROMPT = `You are Kourti, a legal AI that proposes precise redline edits to .docx contracts.

Each edit is a SHORT, MINIMAL substring substitution — never replace whole paragraphs or sentences. Anchor each edit with ~30-60 characters of context_before and context_after copied verbatim from the document so the location is unambiguous.

Rules:
- Copy find / context strings VERBATIM (preserve smart quotes, punctuation, whitespace).
- Each edit must stay within a single paragraph.
- Do NOT re-state the whole sentence in find — keep it tightly scoped.
- For pure insertions, leave find empty and rely on context_before / context_after.

You MUST call the propose_edits tool exactly once with all your suggested edits.`;

const PROPOSE_EDITS_TOOL: ToolDef = {
  name: 'propose_edits',
  description:
    'Propose minimal substring tracked-change edits against a .docx. Each edit replaces a short substring (or inserts at a context anchor).',
  parameters: {
    type: 'object',
    properties: {
      edits: {
        type: 'array',
        description: 'Ordered list of substring substitutions.',
        items: {
          type: 'object',
          properties: {
            find: {
              type: 'string',
              description:
                'Exact substring to replace (verbatim from the document). Empty for pure insertions.',
            },
            replace: {
              type: 'string',
              description: 'Replacement text. Empty string = pure deletion.',
            },
            context_before: {
              type: 'string',
              description: '~40 characters immediately preceding find, verbatim.',
            },
            context_after: {
              type: 'string',
              description: '~40 characters immediately following find, verbatim.',
            },
            reason: {
              type: 'string',
              description: 'One short sentence explaining the change to the user.',
            },
          },
          required: ['find', 'replace', 'context_before', 'context_after'],
        },
      },
    },
    required: ['edits'],
  },
};

function coerceEdits(args: Record<string, unknown>, maxEdits: number): EditInput[] {
  const raw = Array.isArray((args as { edits?: unknown }).edits)
    ? ((args as { edits: unknown[] }).edits as Array<Record<string, unknown>>)
    : [];
  return raw.slice(0, maxEdits).map((e) => ({
    find: typeof e.find === 'string' ? e.find : '',
    replace: typeof e.replace === 'string' ? e.replace : '',
    context_before: typeof e.context_before === 'string' ? e.context_before : '',
    context_after: typeof e.context_after === 'string' ? e.context_after : '',
    reason: typeof e.reason === 'string' ? e.reason : undefined,
  }));
}

// ─────────────────────────────────────────────────────────────────────
// POST /:documentId/propose — generate + apply tracked-change edits
// ─────────────────────────────────────────────────────────────────────
redlineRouter.post(
  '/:documentId/propose',
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const { documentId } = documentIdParamSchema.parse(req.params);
    const body = proposeBodySchema.parse(req.body);

    const active = await loadActiveVersion(documentId, organizationId);
    if (!active || !active.storage_path) {
      throw new ApiError('Document has no file attached', 404, 'FILE_NOT_AVAILABLE');
    }
    if (
      active.mime_type !==
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' &&
      !active.storage_path.toLowerCase().endsWith('.docx')
    ) {
      throw new ApiError('Redline only supports .docx files', 400, 'UNSUPPORTED_FORMAT');
    }

    // Load the docx and pre-normalize Windows-style zip paths.
    const original = await downloadFile('documents', active.storage_path);
    const docxBytes = await normalizeDocxZipPaths(original.data);
    const bodyText = await extractDocxBodyText(docxBytes);

    if (!bodyText.trim()) {
      throw new ApiError('Document has no extractable text', 422, 'EMPTY_DOCUMENT');
    }

    const truncated = bodyText.length > 60_000 ? bodyText.slice(0, 60_000) : bodyText;
    const userPrompt = `INSTRUCTION:\n${body.instruction}\n\nDOCUMENT TEXT (paragraphs joined by \\n):\n${truncated}\n\nReturn at most ${body.maxEdits} edits.`;

    const result = await runWithTools(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      [PROPOSE_EDITS_TOOL],
      { forceTool: 'propose_edits', maxTokens: 4000 }
    );
    if (result.kind !== 'tool_call') {
      throw new ApiError('LLM did not call propose_edits', 502, 'LLM_NO_TOOL_CALL');
    }
    const edits = coerceEdits(result.args, body.maxEdits);
    if (edits.length === 0) {
      return res.json({ success: true, data: { edits: [], errors: [], versionId: null } });
    }

    const applied = await applyTrackedEdits(docxBytes, edits, { author: 'Kourti AI' });

    // Persist the new docx as a new version.
    const ext = path.extname(active.storage_path) || '.docx';
    const newKey = `${organizationId}/${documentId}/${Date.now()}-redline${ext}`;
    await uploadFile(
      'documents',
      newKey,
      applied.bytes,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );

    const newVersion = await createVersion({
      documentId,
      organizationId,
      source: 'assistant_edit',
      storagePath: newKey,
      displayName: 'AI redline',
      sizeBytes: applied.bytes.length,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      createdBy: userId,
      setAsCurrent: true,
    });

    // Persist each applied change as a document_edits row.
    const editRows: { id: string }[] = [];
    for (const change of applied.changes) {
      const r = await db.query<{ id: string }>(
        `insert into public.document_edits
           (document_id, organization_id, version_id, ins_w_id, del_w_id,
            deleted_text, inserted_text, context_before, context_after,
            reason, status, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11)
         returning id`,
        [
          documentId,
          organizationId,
          newVersion.id,
          change.insId ?? null,
          change.delId ?? null,
          change.deletedText,
          change.insertedText,
          change.contextBefore,
          change.contextAfter,
          change.reason ?? null,
          userId,
        ]
      );
      editRows.push(r.rows[0]);
    }

    const signedUrl = createSignedUrl('documents', newKey, 300, organizationId);

    res.json({
      success: true,
      data: {
        versionId: newVersion.id,
        versionNumber: newVersion.version_number,
        downloadUrl: signedUrl,
        appliedCount: applied.changes.length,
        errors: applied.errors,
        edits: applied.changes.map((c: (typeof applied.changes)[number], i: number) => ({
          id: editRows[i]?.id,
          ins_w_id: c.insId,
          del_w_id: c.delId,
          deleted_text: c.deletedText,
          inserted_text: c.insertedText,
          context_before: c.contextBefore,
          context_after: c.contextAfter,
          reason: c.reason,
        })),
      },
    });
  })
);

// ─────────────────────────────────────────────────────────────────────
// POST /:documentId/edits/:editId/(accept|reject)
// ─────────────────────────────────────────────────────────────────────
async function resolveEdit(
  req: import('express').Request,
  res: import('express').Response,
  verb: 'accept' | 'reject'
) {
  const { organizationId, userId } = req.auth!;
  const { documentId, editId } = editIdParamSchema.parse(req.params);

  const editRow = await db.query<{
    id: string;
    document_id: string;
    version_id: string | null;
    ins_w_id: string | null;
    del_w_id: string | null;
    status: string;
  }>(
    `select id, document_id, version_id, ins_w_id, del_w_id, status
       from public.document_edits
      where id = $1 and document_id = $2 and organization_id = $3
      limit 1`,
    [editId, documentId, organizationId]
  );
  const edit = editRow.rows[0];
  if (!edit) throw new ApiError('Edit not found', 404, 'NOT_FOUND');

  if (edit.status !== 'pending') {
    return res.json({
      success: true,
      data: { ok: true, already_resolved: true, status: edit.status },
    });
  }

  const active = await loadActiveVersion(documentId, organizationId);
  if (!active) throw new ApiError('Document missing active version', 404, 'NOT_FOUND');

  const original = await downloadFile('documents', active.storage_path);
  const ids: string[] = [];
  if (edit.ins_w_id) ids.push(edit.ins_w_id);
  if (edit.del_w_id) ids.push(edit.del_w_id);

  const { bytes, found } = await resolveTrackedChange(original.data, ids, verb);
  if (!found) {
    throw new ApiError(
      'Tracked change not found in current document version',
      409,
      'CHANGE_NOT_IN_DOC'
    );
  }

  const ext = path.extname(active.storage_path) || '.docx';
  const newKey = `${organizationId}/${documentId}/${Date.now()}-${verb}${ext}`;
  await uploadFile(
    'documents',
    newKey,
    bytes,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );

  const newVersion = await createVersion({
    documentId,
    organizationId,
    source: verb === 'accept' ? 'user_accept' : 'user_reject',
    storagePath: newKey,
    displayName: `${verb === 'accept' ? 'Accepted' : 'Rejected'} edit`,
    sizeBytes: bytes.length,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    createdBy: userId,
    setAsCurrent: true,
  });

  await db.query(
    `update public.document_edits
        set status = $1,
            resolved_at = now(),
            resolved_by = $2
      where id = $3`,
    [verb === 'accept' ? 'accepted' : 'rejected', userId, editId]
  );

  const signedUrl = createSignedUrl('documents', newKey, 300, organizationId);
  res.json({
    success: true,
    data: {
      ok: true,
      status: verb === 'accept' ? 'accepted' : 'rejected',
      version_id: newVersion.id,
      download_url: signedUrl,
    },
  });
}

redlineRouter.post(
  '/:documentId/edits/:editId/accept',
  asyncHandler((req, res) => resolveEdit(req, res, 'accept'))
);

redlineRouter.post(
  '/:documentId/edits/:editId/reject',
  asyncHandler((req, res) => resolveEdit(req, res, 'reject'))
);

// GET /:documentId/edits — list edits for a document (optional ?status=)
redlineRouter.get(
  '/:documentId/edits',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { documentId } = documentIdParamSchema.parse(req.params);
    const status = z.enum(['pending', 'accepted', 'rejected']).optional().parse(req.query.status);

    const params: unknown[] = [documentId, organizationId];
    let where = `document_id = $1 and organization_id = $2`;
    if (status) {
      params.push(status);
      where += ` and status = $${params.length}`;
    }
    const result = await db.query(
      `select * from public.document_edits where ${where} order by created_at desc`,
      params
    );
    res.json({ success: true, data: result.rows });
  })
);
