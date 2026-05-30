/**
 * Extract human-readable marketing copy from the marketing site's source.
 *
 * The marketing site is a client-rendered Vite SPA, so the deployed HTML is an
 * empty shell — the real copy lives in the React `.tsx` files. This module reads
 * those files and pulls out the visible prose (JSX text nodes + sentence-like
 * string literals), filtering out code, imports, classNames, URLs, and handlers.
 *
 * It's intentionally heuristic: the chat route grounds answers on this text and
 * is instructed not to invent claims, so a little noise in the embeddings is
 * harmless. The result feeds the same `ingestKnowledge()` pipeline that uses
 * your already-configured embedding model.
 *
 * Source location resolves (in order): MARKETING_SRC_DIR env → ../../../marketing/src
 * relative to this file (monorepo layout) → ./marketing/src under cwd.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { KnowledgeEntry } from '../data/kourtiKnowledge.js';

const HERE = dirname(fileURLToPath(import.meta.url));

function resolveMarketingSrc(): string | null {
  const candidates = [
    process.env.MARKETING_SRC_DIR,
    resolve(HERE, '../../../marketing/src'),
    resolve(process.cwd(), '../marketing/src'),
    resolve(process.cwd(), 'marketing/src'),
  ].filter(Boolean) as string[];
  return candidates.find((p) => existsSync(p)) ?? null;
}

// Files whose copy we don't want in the bot's knowledge.
const SKIP_FILES = new Set(['NotFound.tsx', 'ChatBubble.tsx']);

// Map a source file to a knowledge category.
function categoryFor(file: string): KnowledgeEntry['category'] {
  const n = file.toLowerCase();
  if (n.includes('pricing')) return 'pricing';
  if (n.includes('contact') || n.includes('assessment')) return 'faq';
  if (n.includes('about') || n.includes('privacy') || n.includes('terms')) return 'company';
  return 'product';
}

function isProse(v: string): boolean {
  const s = v.trim();
  if (s.length < 6) return false;
  if (!/[a-zA-Z]/.test(s)) return false;
  if (/[{}]/.test(s)) return false; // template/expression fragments
  if (/^\//.test(s) || /^https?:\/\//.test(s) || /^@\//.test(s)) return false; // paths/urls
  if (/^[#.]/.test(s)) return false; // selectors/anchors
  if (/=>|\(\)|;\s*$|\bclassName\b|\bimport\b|\bconst\b|\breturn\b|=\s*$/.test(s)) return false;
  // Require either a space (phrase) or a reasonably long single token (e.g. a heading word).
  if (!/\s/.test(s) && s.length < 14) return false;
  // Reject Tailwind/class-like strings: dash/colon utility tokens, no sentence punctuation.
  const looksClassy =
    /(-|:)/.test(s) &&
    !/[.!?,]/.test(s) &&
    /\b(flex|grid|text|bg|rounded|px|py|pt|pb|mt|mb|ml|mr|gap|w-|h-|min-|max-|hover|focus|sm|md|lg|xl|2xl|font|border|absolute|relative|fixed|sticky|z-|space-|items|justify|inline|block|hidden|opacity|shadow|ring|transition|duration|animate|leading|tracking|col|row)\b/.test(
      s
    );
  if (looksClassy) return false;
  return true;
}

/** Pull visible prose out of one .tsx file. */
export function extractText(code: string): string[] {
  // Strip comments.
  let s = code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  // Drop import lines (URLs/paths there are noise).
  s = s.replace(/^\s*import\s[^\n]*$/gm, '');

  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const t = raw.replace(/\s+/g, ' ').trim();
    if (!isProse(t)) return;
    const k = t.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(t);
    }
  };

  // 1) Sentence-like string literals (titles, descriptions in data arrays).
  const strRe = /(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  let m: RegExpExecArray | null;
  while ((m = strRe.exec(s))) push(m[2]);

  // 2) JSX text nodes — strip attributes first so classNames don't leak in.
  const noAttrs = s.replace(/\s[a-zA-Z_:-]+=("[^"]*"|'[^']*'|\{[^{}]*\})/g, ' ');
  const nodeRe = />([^<>{}]+)</g;
  while ((m = nodeRe.exec(noAttrs))) push(m[1]);

  return out;
}

function titleFromFile(file: string, lines: string[]): string {
  const base = basename(file, '.tsx');
  const pretty = base.replace(/([a-z])([A-Z])/g, '$1 $2');
  // Prefer the first short, heading-like line as the title.
  const heading = lines.find((l) => l.length <= 80 && /[a-zA-Z]/.test(l));
  return heading && heading.length >= 6 ? heading : pretty;
}

/**
 * Read the marketing site source and return one KnowledgeEntry per page/section.
 * Returns [] (with a warning) if the source can't be found, so the caller can
 * fall back to curated content only.
 */
export function extractSiteEntries(): KnowledgeEntry[] {
  const srcDir = resolveMarketingSrc();
  if (!srcDir) {
    console.warn(
      '[extract] marketing/src not found — set MARKETING_SRC_DIR or run from the monorepo. Skipping site extraction.'
    );
    return [];
  }

  const dirs = [
    { dir: join(srcDir, 'pages'), prefix: 'site-page' },
    { dir: join(srcDir, 'components', 'sections'), prefix: 'site-section' },
  ];

  const entries: KnowledgeEntry[] = [];
  for (const { dir, prefix } of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.tsx') || SKIP_FILES.has(file)) continue;
      const code = readFileSync(join(dir, file), 'utf8');
      const lines = extractText(code);
      // Skip near-empty files (pure layout wrappers with no copy).
      const body = lines.join('\n');
      if (body.replace(/\s/g, '').length < 40) continue;

      const base = basename(file, '.tsx');
      entries.push({
        id: `${prefix}-${base.toLowerCase()}`,
        title: titleFromFile(file, lines),
        category: categoryFor(file),
        content: body,
      });
    }
  }

  console.log(`[extract] Extracted ${entries.length} entries from ${srcDir}`);
  return entries;
}
