/**
 * Platform-admin MARTHA knowledge-base admin.
 *
 * CRUD over the `marketing_kb_chunks` pgvector table that grounds the public
 * marketing chatbot (MARTHA), plus a retrieval preview and a re-ingest trigger.
 *
 * Reads gate on 'platform.read'; mutations gate on 'content.manage', require a
 * reason (>=3 chars), and are recorded via recordAdminAction. Embedding vectors
 * are NEVER returned to the client — they are large, opaque, and useless to a
 * human reviewer, so list/detail responses null them out.
 *
 * Embedding + retrieval are REUSED from the existing pipeline, never duplicated:
 *   - generateEmbedding()  (lib/openai.ts) — same OpenRouter model as ingest.
 *   - searchMarketingKb()  (services/marketingKb.ts) — the exact function the
 *     public /chat route calls, so test-retrieval previews what MARTHA sees.
 *   - ingestKnowledge()    (services/marketingKb.ts) — the routine `kb:ingest`
 *     runs; re-ingest spawns the script out-of-process so a long embed run
 *     can't block or crash the API event loop.
 *
 * Mounted (relative) under /api/v1/admin with a /kb prefix, after requireAuth.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { asyncHandler } from '../../lib/http.js';
import { generateEmbedding } from '../../lib/openai.js';
import { requireAdminCapabilityFor } from '../../services/authorization.js';
import { recordAdminAction } from '../../services/adminAudit.js';
import { searchMarketingKb } from '../../services/marketingKb.js';

export const adminKbRouter = Router();

const EMBEDDING_DIM = 1536;
const CONTENT_PREVIEW_LEN = 280;

/** Format a JS number[] as a pgvector literal, mirroring services/marketingKb.ts. */
function toVectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.4);
}

/** Best-effort embedding. Never throws — chunks can exist without a vector
 *  (they'll just fall back to ILIKE retrieval) and a re-ingest can backfill. */
async function tryEmbed(
  text: string
): Promise<{ embedding: number[] | null; error: string | null }> {
  try {
    const embedding = await generateEmbedding(text);
    if (Array.isArray(embedding) && embedding.length === EMBEDDING_DIM) {
      return { embedding, error: null };
    }
    return {
      embedding: null,
      error: `unexpected embedding dimension ${embedding?.length ?? 'null'}`,
    };
  } catch (err) {
    return { embedding: null, error: err instanceof Error ? err.message : String(err) };
  }
}

const idParam = z.object({ id: z.string().uuid() });
const reason = z.string().trim().min(3).max(1000);

// ── List ────────────────────────────────────────────────────────────────────
const listQuery = z.object({
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

adminKbRouter.get(
  '/kb/chunks',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');
    const { q, limit, offset } = listQuery.parse(req.query);

    const where: string[] = [];
    const values: unknown[] = [];
    if (q) {
      // Escape ILIKE metacharacters so user input is treated literally.
      values.push(`%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
      where.push(`(content ilike $${values.length} or title ilike $${values.length})`);
    }
    const whereSql = where.length ? `where ${where.join(' and ')}` : '';

    const countRes = await db
      .query<{
        count: string;
      }>(`select count(*)::text as count from public.marketing_kb_chunks ${whereSql}`, values)
      .catch(() => ({ rows: [{ count: '0' }] }));

    values.push(limit, offset);
    const rows = await db
      .query<{
        id: string;
        entry_id: string;
        title: string;
        category: string;
        chunk_index: number;
        content: string;
        token_count: number | null;
        has_embedding: boolean;
        created_at: string;
      }>(
        `select id, entry_id, title, category, chunk_index, content, token_count,
                (embedding is not null) as has_embedding, created_at
           from public.marketing_kb_chunks
           ${whereSql}
          order by created_at desc, entry_id asc, chunk_index asc
          limit $${values.length - 1} offset $${values.length}`,
        values
      )
      .catch(() => ({ rows: [] as never[] }));

    res.status(200).json({
      total: Number(countRes.rows[0]?.count ?? '0'),
      limit,
      offset,
      // embedding is intentionally omitted; only a boolean flag is exposed.
      chunks: rows.rows.map((r) => ({
        id: r.id,
        entry_id: r.entry_id,
        title: r.title,
        category: r.category,
        chunk_index: r.chunk_index,
        content_preview:
          r.content.length > CONTENT_PREVIEW_LEN
            ? `${r.content.slice(0, CONTENT_PREVIEW_LEN)}…`
            : r.content,
        token_count: r.token_count,
        has_embedding: r.has_embedding,
        created_at: r.created_at,
      })),
    });
  })
);

// ── Detail ───────────────────────────────────────────────────────────────────
adminKbRouter.get(
  '/kb/chunks/:id',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');
    const { id } = idParam.parse(req.params);

    const result = await db
      .query<{
        id: string;
        entry_id: string;
        title: string;
        category: string;
        chunk_index: number;
        content: string;
        token_count: number | null;
        has_embedding: boolean;
        created_at: string;
      }>(
        `select id, entry_id, title, category, chunk_index, content, token_count,
                (embedding is not null) as has_embedding, created_at
           from public.marketing_kb_chunks
          where id = $1`,
        [id]
      )
      .catch(() => ({ rows: [] as never[] }));

    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ error: 'KB chunk not found', code: 'NOT_FOUND' });
      return;
    }
    // Full content, but the raw embedding vector is still withheld.
    res.status(200).json({ ...row, embedding: null });
  })
);

// ── Create ───────────────────────────────────────────────────────────────────
const createBody = z.object({
  content: z.string().trim().min(1).max(20000),
  // Maps to entry_id; defaults to a stable manual id so re-ingest's prune won't
  // silently delete admin-authored chunks (their ids won't match site entries,
  // but they will survive non-pruning passes and are easy to spot).
  source: z.string().trim().min(1).max(200).optional(),
  title: z.string().trim().max(300).optional(),
  category: z.string().trim().max(120).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  reason,
});

adminKbRouter.post(
  '/kb/chunks',
  asyncHandler(async (req, res) => {
    const adminId = req.auth!.userId;
    await requireAdminCapabilityFor(adminId, 'content.manage');
    const body = createBody.parse(req.body);

    const entryId = body.source ?? `admin:${Date.now()}`;
    const title = body.title ?? entryId;
    const category = body.category ?? 'admin';

    const { embedding, error: embedError } = await tryEmbed(`${title}\n\n${body.content}`.trim());

    // chunk_index is per-entry; for a fresh manual entry compute the next index
    // so the (entry_id, chunk_index) unique constraint is respected.
    const nextIdx = await db
      .query<{ next: number }>(
        `select coalesce(max(chunk_index) + 1, 0) as next
           from public.marketing_kb_chunks where entry_id = $1`,
        [entryId]
      )
      .then((r) => Number(r.rows[0]?.next ?? 0))
      .catch(() => 0);

    const result = await db.query<{ id: string }>(
      `insert into public.marketing_kb_chunks
         (entry_id, title, category, chunk_index, content, embedding, token_count)
       values ($1,$2,$3,$4,$5,$6,$7)
       returning id`,
      [
        entryId,
        title,
        category,
        nextIdx,
        body.content,
        embedding ? toVectorLiteral(embedding) : null,
        estimateTokens(body.content),
      ]
    );

    const id = result.rows[0]?.id;
    await recordAdminAction({
      adminUserId: adminId,
      actionType: 'kb.chunk.create',
      targetType: 'kb_chunk',
      targetId: id,
      reason: body.reason,
      // before/after carry content only — never the embedding vector.
      after: { entry_id: entryId, title, category, content: body.content },
      details: {
        embedded: !!embedding,
        ...(embedError ? { embedError } : {}),
        metadata: body.metadata ?? null,
      },
      req,
    });

    res.status(201).json({
      id,
      entry_id: entryId,
      title,
      category,
      chunk_index: nextIdx,
      embedded: !!embedding,
      embed_error: embedError,
    });
  })
);

// ── Update ───────────────────────────────────────────────────────────────────
const updateBody = z.object({
  content: z.string().trim().min(1).max(20000).optional(),
  source: z.string().trim().min(1).max(200).optional(),
  title: z.string().trim().max(300).optional(),
  category: z.string().trim().max(120).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  reason,
});

adminKbRouter.put(
  '/kb/chunks/:id',
  asyncHandler(async (req, res) => {
    const adminId = req.auth!.userId;
    await requireAdminCapabilityFor(adminId, 'content.manage');
    const { id } = idParam.parse(req.params);
    const body = updateBody.parse(req.body);

    const existing = await db
      .query<{
        id: string;
        entry_id: string;
        title: string;
        category: string;
        content: string;
      }>(
        `select id, entry_id, title, category, content
           from public.marketing_kb_chunks where id = $1`,
        [id]
      )
      .then((r) => r.rows[0] ?? null)
      .catch(() => null);

    if (!existing) {
      res.status(404).json({ error: 'KB chunk not found', code: 'NOT_FOUND' });
      return;
    }

    const nextContent = body.content ?? existing.content;
    const nextTitle = body.title ?? existing.title;
    const nextCategory = body.category ?? existing.category;
    const nextEntryId = body.source ?? existing.entry_id;

    // Re-embed when the embeddable text (title + content) changed.
    const contentChanged =
      (body.content !== undefined && body.content !== existing.content) ||
      (body.title !== undefined && body.title !== existing.title);

    let embedError: string | null = null;
    let embeddedNow = false;
    let embeddingLiteral: string | null = null;
    if (contentChanged) {
      const r = await tryEmbed(`${nextTitle}\n\n${nextContent}`.trim());
      embedError = r.error;
      embeddedNow = !!r.embedding;
      embeddingLiteral = r.embedding ? toVectorLiteral(r.embedding) : null;
    }

    // If re-embed succeeded, write the new vector; if content changed but
    // embedding failed, null the stale vector so retrieval doesn't serve copy
    // that no longer matches its embedding. Otherwise leave embedding untouched.
    const result = await db.query<{ id: string }>(
      `update public.marketing_kb_chunks
          set entry_id = $2,
              title = $3,
              category = $4,
              content = $5,
              token_count = $6,
              embedding = case
                when $7::boolean then $8::vector
                else embedding
              end
        where id = $1
        returning id`,
      [
        id,
        nextEntryId,
        nextTitle,
        nextCategory,
        nextContent,
        estimateTokens(nextContent),
        contentChanged,
        embeddingLiteral,
      ]
    );

    await recordAdminAction({
      adminUserId: adminId,
      actionType: 'kb.chunk.update',
      targetType: 'kb_chunk',
      targetId: id,
      reason: body.reason,
      before: {
        entry_id: existing.entry_id,
        title: existing.title,
        category: existing.category,
        content: existing.content,
      },
      after: {
        entry_id: nextEntryId,
        title: nextTitle,
        category: nextCategory,
        content: nextContent,
      },
      details: {
        contentChanged,
        reEmbedded: embeddedNow,
        ...(embedError ? { embedError } : {}),
        metadata: body.metadata ?? null,
      },
      req,
    });

    res.status(200).json({
      id: result.rows[0]?.id ?? id,
      reEmbedded: embeddedNow,
      embed_error: embedError,
    });
  })
);

// ── Delete ───────────────────────────────────────────────────────────────────
const deleteBody = z.object({ reason });

adminKbRouter.delete(
  '/kb/chunks/:id',
  asyncHandler(async (req, res) => {
    const adminId = req.auth!.userId;
    await requireAdminCapabilityFor(adminId, 'content.manage');
    const { id } = idParam.parse(req.params);
    const body = deleteBody.parse(req.body ?? {});

    const existing = await db
      .query<{
        id: string;
        entry_id: string;
        title: string;
        category: string;
        content: string;
      }>(
        `select id, entry_id, title, category, content
           from public.marketing_kb_chunks where id = $1`,
        [id]
      )
      .then((r) => r.rows[0] ?? null)
      .catch(() => null);

    if (!existing) {
      res.status(404).json({ error: 'KB chunk not found', code: 'NOT_FOUND' });
      return;
    }

    await db.query('delete from public.marketing_kb_chunks where id = $1', [id]);

    await recordAdminAction({
      adminUserId: adminId,
      actionType: 'kb.chunk.delete',
      targetType: 'kb_chunk',
      targetId: id,
      reason: body.reason,
      before: {
        entry_id: existing.entry_id,
        title: existing.title,
        category: existing.category,
        content: existing.content,
      },
      req,
    });

    res.status(200).json({ ok: true, id });
  })
);

// ── Test retrieval (preview what MARTHA grounds on) ──────────────────────────
const testBody = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.coerce.number().int().positive().max(20).optional().default(5),
});

adminKbRouter.post(
  '/kb/test-retrieval',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');
    const { query, limit } = testBody.parse(req.body ?? {});

    // Reuse the EXACT retrieval the public /chat route uses, so the preview is
    // faithful (vector search with ILIKE fallback baked in).
    const matches = await searchMarketingKb(query, limit).catch(() => []);

    res.status(200).json({
      query,
      count: matches.length,
      // similarity 0 means the result came from the ILIKE text fallback.
      matches: matches.map((m) => ({
        entry_id: m.entryId,
        title: m.title,
        category: m.category,
        similarity: m.similarity,
        content_preview:
          m.content.length > CONTENT_PREVIEW_LEN
            ? `${m.content.slice(0, CONTENT_PREVIEW_LEN)}…`
            : m.content,
      })),
    });
  })
);

// ── Re-ingest (rebuild KB from source) ───────────────────────────────────────
const reingestBody = z.object({ reason });

// Resolve the package.json that owns the `kb:ingest` script. __dirname here is
// .../backend-node/dist/routes/api (compiled) or .../src/routes/api (tsx); the
// backend-node root is four levels up in both layouts.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '../../../..');

adminKbRouter.post(
  '/kb/reingest',
  asyncHandler(async (req, res) => {
    const adminId = req.auth!.userId;
    await requireAdminCapabilityFor(adminId, 'content.manage');
    const body = reingestBody.parse(req.body ?? {});

    // The ingest is a script (tsx src/scripts/ingestMarketingKb.ts), not a
    // re-entrant function: it merges live site copy + curated KB and calls
    // process.exit(). Embedding the whole corpus can take a while, so we spawn
    // it detached and return 202 immediately. A spawn failure is caught and
    // reported as queued=false without ever crashing the API process.
    let queued = false;
    let spawnError: string | null = null;
    try {
      const child = spawn('npm', ['run', 'kb:ingest'], {
        cwd: BACKEND_ROOT,
        detached: true,
        stdio: 'ignore',
        env: process.env,
      });
      child.on('error', (err) => {
        // Async spawn failure (e.g. npm not on PATH). Log; never throw here —
        // this fires after the response has been sent.
        console.error('[kb:reingest] spawn failed:', err instanceof Error ? err.message : err);
      });
      child.unref();
      queued = true;
    } catch (err) {
      spawnError = err instanceof Error ? err.message : String(err);
      console.error('[kb:reingest] failed to start:', spawnError);
    }

    await recordAdminAction({
      adminUserId: adminId,
      actionType: 'kb.reingest',
      targetType: 'kb_chunk',
      targetId: null,
      reason: body.reason,
      details: { queued, command: 'npm run kb:ingest', ...(spawnError ? { spawnError } : {}) },
      req,
    });

    res.status(202).json({
      queued,
      message: queued
        ? 'Re-ingest started in the background. The KB will refresh once embeddings finish; use Test retrieval to verify.'
        : 'Could not start the re-ingest process on this host. Run `npm run kb:ingest` from CI instead.',
      ...(spawnError ? { error: spawnError } : {}),
    });
  })
);
