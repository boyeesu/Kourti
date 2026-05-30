/**
 * Build-time extractor: turns the marketing site's source copy into a public
 * JSON artifact (public/kb-content.json) that the backend chatbot fetches and
 * embeds. Runs as part of `npm run build` (before vite), so every marketing
 * deploy republishes the latest copy and the bot picks it up on its next sync.
 *
 * Pure Node, no dependencies. Heuristic on purpose: it pulls JSX text nodes and
 * sentence-like string literals (titles/descriptions) while dropping imports,
 * classNames, URLs, and handlers. The chat route is grounded on this text and
 * told not to invent claims, so minor noise is harmless.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..'); // marketing/
const SRC = join(ROOT, 'src');
const OUT = join(ROOT, 'public', 'kb-content.json');

const SKIP_FILES = new Set(['NotFound.tsx', 'ChatBubble.tsx']);

function categoryFor(file) {
  const n = file.toLowerCase();
  if (n.includes('pricing')) return 'pricing';
  if (n.includes('contact') || n.includes('assessment')) return 'faq';
  if (n.includes('about') || n.includes('privacy') || n.includes('terms')) return 'company';
  return 'product';
}

function isProse(v) {
  const s = v.trim();
  if (s.length < 6) return false;
  if (!/[a-zA-Z]/.test(s)) return false;
  if (/[{}]/.test(s)) return false;
  if (/^\//.test(s) || /^https?:\/\//.test(s) || /^@\//.test(s)) return false;
  if (/^[#.]/.test(s)) return false;
  if (/=>|\(\)|;\s*$|\bclassName\b|\bimport\b|\bconst\b|\breturn\b|=\s*$/.test(s)) return false;
  if (!/\s/.test(s) && s.length < 14) return false;
  const looksClassy =
    /(-|:)/.test(s) &&
    !/[.!?,]/.test(s) &&
    /\b(flex|grid|text|bg|rounded|px|py|pt|pb|mt|mb|ml|mr|gap|w-|h-|min-|max-|hover|focus|sm|md|lg|xl|2xl|font|border|absolute|relative|fixed|sticky|z-|space-|items|justify|inline|block|hidden|opacity|shadow|ring|transition|duration|animate|leading|tracking|col|row)\b/.test(
      s
    );
  if (looksClassy) return false;
  return true;
}

function extractText(code) {
  let s = code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  s = s.replace(/^\s*import\s[^\n]*$/gm, '');

  const out = [];
  const seen = new Set();
  const push = (raw) => {
    const t = raw.replace(/\s+/g, ' ').trim();
    if (!isProse(t)) return;
    const k = t.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(t);
    }
  };

  const strRe = /(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  let m;
  while ((m = strRe.exec(s))) push(m[2]);

  const noAttrs = s.replace(/\s[a-zA-Z_:-]+=("[^"]*"|'[^']*'|\{[^{}]*\})/g, ' ');
  const nodeRe = />([^<>{}]+)</g;
  while ((m = nodeRe.exec(noAttrs))) push(m[1]);

  return out;
}

function titleFromFile(file, lines) {
  const base = basename(file, '.tsx');
  const pretty = base.replace(/([a-z])([A-Z])/g, '$1 $2');
  const heading = lines.find((l) => l.length <= 80 && /[a-zA-Z]/.test(l));
  return heading && heading.length >= 6 ? heading : pretty;
}

function collect(dir, prefix, out) {
  if (!existsSync(dir)) return;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.tsx') || SKIP_FILES.has(file)) continue;
    const lines = extractText(readFileSync(join(dir, file), 'utf8'));
    const body = lines.join('\n');
    if (body.replace(/\s/g, '').length < 40) continue;
    const base = basename(file, '.tsx');
    out.push({
      id: `${prefix}-${base.toLowerCase()}`,
      title: titleFromFile(file, lines),
      category: categoryFor(file),
      content: body,
    });
  }
}

function main() {
  const entries = [];
  collect(join(SRC, 'pages'), 'site-page', entries);
  collect(join(SRC, 'components', 'sections'), 'site-section', entries);

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2)
  );
  console.log(`[extract-kb] Wrote ${entries.length} entries to public/kb-content.json`);
}

main();
