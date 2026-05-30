/**
 * Marketing chatbot KB sync (scheduled).
 *
 * The marketing build publishes a public JSON of the current site copy at
 * env.MARKETING_KB_URL (e.g. https://kourti.com/kb-content.json). This job
 * fetches it on a nightly cron (and once shortly after boot), merges in the
 * curated supplements from data/kourtiKnowledge.ts, and re-embeds everything
 * into marketing_kb_chunks using the already-configured embedding model.
 *
 * No secrets required — the artifact is public marketing copy. If the fetch
 * fails we keep the existing KB (never prune to empty) and only refresh the
 * curated entries.
 */
import type { Job } from 'pg-boss';

import { getBoss, registerAgentHandler } from '../lib/pgboss.js';
import { env } from '../config/env.js';
import { ingestKnowledge } from '../services/marketingKb.js';
import { KOURTI_KNOWLEDGE, type KnowledgeEntry } from '../data/kourtiKnowledge.js';

const CATEGORIES = new Set<KnowledgeEntry['category']>(['product', 'pricing', 'faq', 'company']);

function sanitizeEntries(raw: unknown): KnowledgeEntry[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { entries?: unknown[] }).entries)
      ? (raw as { entries: unknown[] }).entries
      : [];

  const out: KnowledgeEntry[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const { id, title, category, content } = item as Record<string, unknown>;
    if (
      typeof id === 'string' &&
      typeof title === 'string' &&
      typeof content === 'string' &&
      typeof category === 'string' &&
      CATEGORIES.has(category as KnowledgeEntry['category']) &&
      id.trim() &&
      content.trim()
    ) {
      out.push({
        id: id.trim().slice(0, 200),
        title: title.trim().slice(0, 500),
        category: category as KnowledgeEntry['category'],
        content: content.trim().slice(0, 20_000),
      });
    }
  }
  return out;
}

export async function runMarketingKbSync(): Promise<void> {
  let siteEntries: KnowledgeEntry[] = [];

  if (env.MARKETING_KB_URL) {
    try {
      const res = await fetch(env.MARKETING_KB_URL, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      siteEntries = sanitizeEntries(await res.json());
      console.log(
        `[marketing-kb] Fetched ${siteEntries.length} site entries from MARKETING_KB_URL`
      );
    } catch (err) {
      console.error(
        '[marketing-kb] Failed to fetch site KB:',
        err instanceof Error ? err.message : err
      );
    }
  } else {
    console.warn('[marketing-kb] MARKETING_KB_URL not set — embedding curated content only.');
  }

  // Site copy is primary; curated supplements win on id collisions.
  const byId = new Map<string, KnowledgeEntry>();
  for (const e of siteEntries) byId.set(e.id, e);
  for (const e of KOURTI_KNOWLEDGE) byId.set(e.id, e);
  const merged = [...byId.values()];

  // Only prune stale rows when we actually pulled fresh site data, so a failed
  // fetch never wipes a good knowledge base.
  const prune = siteEntries.length > 0;
  const written = await ingestKnowledge(merged, { prune });
  console.log(
    `[marketing-kb] Re-embedded ${written} chunk(s) from ${merged.length} entries (prune=${prune}).`
  );
}

registerAgentHandler('marketing_kb_sync', async (_job: Job) => {
  await runMarketingKbSync();
});

export async function startMarketingKbScheduler() {
  const boss = getBoss();

  await boss.createQueue('marketing_kb_sync', {
    retryLimit: 1,
    expireInSeconds: 600,
    deleteAfterSeconds: 86_400,
  });

  // Nightly cron (configurable via MARKETING_KB_SYNC_CRON).
  await boss.schedule('marketing_kb_sync', env.MARKETING_KB_SYNC_CRON, {}, {});
  // Also run shortly after boot so a fresh deploy / content change is reflected.
  await boss.send('marketing_kb_sync', {}, { startAfter: 20 });

  console.log(`[marketing-kb] Scheduled (${env.MARKETING_KB_SYNC_CRON}) + initial run queued`);
}
