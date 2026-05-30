/**
 * Marketing knowledge base — the public, unauthenticated RAG store that powers
 * the marketing-site chatbot (MARTHA). It reuses the same pgvector database and
 * the same OpenRouter embedding pipeline as the tenant document RAG, but lives
 * in its own `marketing_kb_chunks` table so public marketing content is never
 * mixed with confidential customer documents.
 *
 * Content comes from `data/kourtiKnowledge.ts`. Run `scripts/ingestMarketingKb`
 * to (re)embed it after editing. Search degrades gracefully: if pgvector or the
 * table is unavailable it falls back to ILIKE text search, and if that fails it
 * returns no results so the chat route can still answer from live plan data.
 */
import { db } from '../db/pool.js';
import { generateEmbedding, generateEmbeddingsBatch } from '../lib/openai.js';
import { KOURTI_KNOWLEDGE, type KnowledgeEntry } from '../data/kourtiKnowledge.js';

export interface KbMatch {
  entryId: string;
  title: string;
  category: string;
  content: string;
  similarity: number;
}

const EMBEDDING_DIM = 1536;
const CHUNK_MAX_TOKENS = 600;
const CHUNK_OVERLAP_TOKENS = 80;

function estimateTokens(text: string): number {
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.4);
}

/** Format a JS number[] as a pgvector literal, e.g. "[0.1,0.2,...]". */
function toVectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

/**
 * Split an entry into overlapping chunks. Most KB entries are short enough to be
 * a single chunk; longer ones are split on sentence boundaries with overlap so
 * retrieval keeps surrounding context.
 */
function chunkEntry(entry: KnowledgeEntry): string[] {
  const base = `${entry.title}\n\n${entry.content}`.trim();
  if (estimateTokens(base) <= CHUNK_MAX_TOKENS) return [base];

  const sentences = entry.content.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  for (const sentence of sentences) {
    const t = estimateTokens(sentence);
    if (currentTokens + t > CHUNK_MAX_TOKENS && current.length) {
      chunks.push(`${entry.title}\n\n${current.join(' ')}`.trim());
      // keep a tail of the previous chunk for overlap
      const overlap: string[] = [];
      let overlapTokens = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        const ot = estimateTokens(current[i]);
        if (overlapTokens + ot > CHUNK_OVERLAP_TOKENS) break;
        overlap.unshift(current[i]);
        overlapTokens += ot;
      }
      current = overlap;
      currentTokens = overlapTokens;
    }
    current.push(sentence);
    currentTokens += t;
  }
  if (current.length) chunks.push(`${entry.title}\n\n${current.join(' ')}`.trim());
  return chunks;
}

/** Create the table + index (and try to enable pgvector). Safe to call repeatedly. */
export async function ensureMarketingKbSchema(): Promise<void> {
  // pgvector is already enabled on the cluster for tenant RAG; attempt anyway
  // and ignore failure (e.g. insufficient privileges) — the table still works.
  await db.query('create extension if not exists vector').catch(() => undefined);

  await db.query(`
    create table if not exists public.marketing_kb_chunks (
      id uuid primary key default gen_random_uuid(),
      entry_id text not null,
      title text not null,
      category text not null,
      chunk_index integer not null,
      content text not null,
      embedding vector(${EMBEDDING_DIM}),
      token_count integer,
      created_at timestamptz default now(),
      unique (entry_id, chunk_index)
    )
  `);

  await db
    .query(
      `create index if not exists idx_marketing_kb_embedding
         on public.marketing_kb_chunks using ivfflat (embedding vector_cosine_ops)
         with (lists = 100)`
    )
    .catch(() => undefined);
}

/**
 * Embed all knowledge entries and upsert them. Idempotent: re-running refreshes
 * content in place. Stale chunks from entries that were removed/shrunk are
 * pruned per entry. Returns the number of chunks written.
 */
export async function ingestKnowledge(
  entries: KnowledgeEntry[] = KOURTI_KNOWLEDGE,
  opts: { prune?: boolean } = {}
): Promise<number> {
  await ensureMarketingKbSchema();

  // Drop entries that no longer exist in the source set (e.g. a page that was
  // removed from the marketing site) so the bot stops "remembering" stale copy.
  if (opts.prune) {
    const keepIds = entries.map((e) => e.id);
    await db.query('delete from public.marketing_kb_chunks where entry_id <> all($1::text[])', [
      keepIds.length ? keepIds : ['__none__'],
    ]);
  }

  let written = 0;
  for (const entry of entries) {
    const chunks = chunkEntry(entry);
    const embeddings = await generateEmbeddingsBatch(chunks);

    // Remove any chunks beyond the current count for this entry.
    await db.query(
      'delete from public.marketing_kb_chunks where entry_id = $1 and chunk_index >= $2',
      [entry.id, chunks.length]
    );

    for (let i = 0; i < chunks.length; i++) {
      await db.query(
        `insert into public.marketing_kb_chunks
           (entry_id, title, category, chunk_index, content, embedding, token_count)
         values ($1,$2,$3,$4,$5,$6::vector,$7)
         on conflict (entry_id, chunk_index) do update set
           title = excluded.title,
           category = excluded.category,
           content = excluded.content,
           embedding = excluded.embedding,
           token_count = excluded.token_count`,
        [
          entry.id,
          entry.title,
          entry.category,
          i,
          chunks[i],
          toVectorLiteral(embeddings[i]),
          estimateTokens(chunks[i]),
        ]
      );
      written++;
    }
  }
  return written;
}

/** Vector similarity search over the KB, with an ILIKE fallback. */
export async function searchMarketingKb(
  query: string,
  limit = 5,
  matchThreshold = 0.3
): Promise<KbMatch[]> {
  try {
    const embedding = await generateEmbedding(query);
    const result = await db.query<{
      entry_id: string;
      title: string;
      category: string;
      content: string;
      similarity: number;
    }>(
      `select entry_id, title, category, content,
              1 - (embedding <=> $1::vector) as similarity
         from public.marketing_kb_chunks
        where embedding is not null
          and 1 - (embedding <=> $1::vector) > $2
        order by embedding <=> $1::vector
        limit $3`,
      [toVectorLiteral(embedding), matchThreshold, limit]
    );
    if (result.rows.length) {
      return result.rows.map((r) => ({
        entryId: r.entry_id,
        title: r.title,
        category: r.category,
        content: r.content,
        similarity: Number(r.similarity),
      }));
    }
    // Vector search returned nothing above threshold — try text fallback.
    return await textSearch(query, limit);
  } catch {
    return await textSearch(query, limit).catch(() => []);
  }
}

async function textSearch(query: string, limit: number): Promise<KbMatch[]> {
  const term = `%${query.replace(/[%_]/g, (m) => `\\${m}`).slice(0, 200)}%`;
  const result = await db.query<{
    entry_id: string;
    title: string;
    category: string;
    content: string;
  }>(
    `select entry_id, title, category, content
       from public.marketing_kb_chunks
      where content ilike $1 or title ilike $1
      limit $2`,
    [term, limit]
  );
  return result.rows.map((r) => ({
    entryId: r.entry_id,
    title: r.title,
    category: r.category,
    content: r.content,
    similarity: 0,
  }));
}
