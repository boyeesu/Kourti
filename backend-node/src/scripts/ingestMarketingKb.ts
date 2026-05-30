/**
 * Sync the marketing knowledge base into the `marketing_kb_chunks` pgvector
 * table so the public chatbot (MARTHA) always reflects the current site.
 *
 * Sources, merged in order (later entries with the same id win):
 *   1. Live site copy extracted from the marketing .tsx source (the primary,
 *      auto-updating source — see extractMarketingContent.ts).
 *   2. Curated supplements in data/kourtiKnowledge.ts (things not necessarily on
 *      the site: onboarding steps, security notes, sales FAQ).
 *
 * Stale entries (e.g. a deleted page) are pruned. Embeddings use your already
 * configured model (OPENROUTER_EMBEDDING_MODEL via generateEmbeddingsBatch).
 *
 * Run:  npm run kb:ingest      (locally / in CI; nightly via GitHub Actions)
 * Needs: OPENROUTER_API_KEY (embeddings) and DATABASE_URL. Idempotent.
 */
import { ingestKnowledge } from '../services/marketingKb.js';
import { KOURTI_KNOWLEDGE, type KnowledgeEntry } from '../data/kourtiKnowledge.js';
import { extractSiteEntries } from './extractMarketingContent.js';

function mergeById(...sets: KnowledgeEntry[][]): KnowledgeEntry[] {
  const byId = new Map<string, KnowledgeEntry>();
  for (const set of sets) for (const e of set) byId.set(e.id, e);
  return [...byId.values()];
}

async function main() {
  const site = extractSiteEntries();
  const entries = mergeById(site, KOURTI_KNOWLEDGE);

  console.log(
    `[kb:ingest] ${site.length} site entries + ${KOURTI_KNOWLEDGE.length} curated = ${entries.length} total. Embedding…`
  );
  const written = await ingestKnowledge(entries, { prune: true });
  console.log(`[kb:ingest] Done. Wrote ${written} chunk(s) to marketing_kb_chunks.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[kb:ingest] Failed:', err);
    process.exit(1);
  });
