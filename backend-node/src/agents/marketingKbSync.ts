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

// Hard cap on the KB artifact body. It's curated marketing copy (a handful of
// KB) — anything multi-MB is a misconfig or a hostile/oversized response, and
// buffering it whole would risk heap exhaustion. 5 MB is comfortably generous.
const MARKETING_KB_MAX_BYTES = 5 * 1024 * 1024;

/**
 * SSRF guard for the operator-configured MARKETING_KB_URL. Even though the URL
 * is env-controlled today, a compromised/misconfigured env could point it at an
 * internal metadata endpoint (169.254.169.254), localhost, or a private host.
 * We require https on an allowlisted public host and reject IP-literal hosts in
 * the private / loopback / link-local ranges.
 */
function isAllowedKbUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;

  const host = url.hostname.toLowerCase();

  // Reject obvious loopback / metadata hostnames outright.
  if (host === 'localhost' || host.endsWith('.localhost') || host === 'metadata.google.internal') {
    return false;
  }

  // Reject IP-literal hosts in private / loopback / link-local ranges.
  if (isPrivateOrLocalIp(host)) return false;

  // Host allowlist: only the marketing site and its Vercel previews may serve
  // the KB artifact.
  return host === 'kourti.com' || host.endsWith('.kourti.com') || host.endsWith('.vercel.app');
}

/** True for IPv4/IPv6 literals in loopback, private, or link-local ranges. */
function isPrivateOrLocalIp(host: string): boolean {
  // IPv6 (with or without brackets already stripped by URL.hostname).
  if (host.includes(':')) {
    const h = host.replace(/^\[|\]$/g, '');
    return (
      h === '::1' || // loopback
      h === '::' ||
      h.startsWith('fe80') || // link-local
      h.startsWith('fc') || // unique local
      h.startsWith('fd') ||
      h.startsWith('::ffff:') // IPv4-mapped — defer to the v4 checks below
    );
  }
  // IPv4 dotted-quad.
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false; // not an IP literal — a DNS name, handled by the allowlist
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  return false;
}

/**
 * Fetch the KB artifact with the SSRF allowlist enforced and a streamed byte
 * cap. Aborts the connection the moment the body exceeds MARKETING_KB_MAX_BYTES
 * (and short-circuits on an over-cap Content-Length) so a hostile/oversized
 * response can't be buffered into the heap.
 */
async function fetchKbArtifact(rawUrl: string): Promise<unknown> {
  if (!isAllowedKbUrl(rawUrl)) {
    throw new Error('MARKETING_KB_URL is not on the allowlist (https + *.kourti.com/*.vercel.app)');
  }

  const controller = new AbortController();
  const res = await fetch(rawUrl, {
    headers: { accept: 'application/json' },
    signal: controller.signal,
    redirect: 'error', // a redirect could escape the allowlist — refuse it
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  // Fast reject on an advertised oversized body before reading anything.
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MARKETING_KB_MAX_BYTES) {
    controller.abort();
    throw new Error(`KB artifact too large: ${declared} bytes`);
  }

  if (!res.body) {
    // No stream available — fall back to text() but still bound it after read.
    const text = await res.text();
    if (Buffer.byteLength(text) > MARKETING_KB_MAX_BYTES) {
      throw new Error('KB artifact too large');
    }
    return JSON.parse(text);
  }

  // Stream and count bytes; abort as soon as we cross the cap.
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MARKETING_KB_MAX_BYTES) {
        controller.abort();
        throw new Error('KB artifact exceeded the size cap');
      }
      chunks.push(value);
    }
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

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
      siteEntries = sanitizeEntries(await fetchKbArtifact(env.MARKETING_KB_URL));
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
