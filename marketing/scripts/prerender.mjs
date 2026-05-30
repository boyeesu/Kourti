// Build-time "head prerender" for the SPA.
//
// Vite emits a single dist/index.html whose <head> describes the HOMEPAGE.
// Because this is a client-rendered SPA, social scrapers and non-JS crawlers
// would otherwise see the homepage title/description/canonical on EVERY URL.
//
// This script takes the built index.html as a template and writes one static
// HTML file per route with the correct <title>, description, canonical and
// OG/Twitter tags baked into the markup (body stays the empty #root shell —
// React still hydrates and renders the full app on the client). It also emits
// a real 404.html (noindex) and a fresh sitemap.xml with <lastmod>.
//
// Run automatically after `vite build` (see package.json).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { routes, SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE } from './seo-routes.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');
const PUBLIC = join(ROOT, 'public');

const TEMPLATE_PATH = join(DIST, 'index.html');
if (!existsSync(TEMPLATE_PATH)) {
  console.error('[prerender] dist/index.html not found — run `vite build` first.');
  process.exit(1);
}
const template = readFileSync(TEMPLATE_PATH, 'utf8');

const escAttr = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Replace the first tag matching `re` with `replacement`. If absent, insert
// the replacement just before </head> so nothing is silently dropped.
function setTag(html, re, replacement) {
  if (re.test(html)) return html.replace(re, replacement);
  return html.replace('</head>', `  ${replacement}\n</head>`);
}

function buildHtml(route) {
  const url = `${SITE_URL}${route.path === '/' ? '/' : route.path}`;
  const title = route.title;
  const desc = route.description;
  const ogImage = route.ogImage || DEFAULT_OG_IMAGE;

  // Emit replacements with data-rh="true" so react-helmet-async adopts and
  // reconciles them on hydration instead of appending duplicates.
  let html = template;
  html = setTag(html, /<title>[\s\S]*?<\/title>/, `<title>${escText(title)}</title>`);
  html = setTag(
    html,
    /<meta\s+name="description"[^>]*>/,
    `<meta name="description" data-rh="true" content="${escAttr(desc)}" />`
  );
  html = setTag(
    html,
    /<link\s+rel="canonical"[^>]*>/,
    `<link rel="canonical" data-rh="true" href="${escAttr(url)}" />`
  );
  html = setTag(
    html,
    /<meta\s+property="og:title"[^>]*>/,
    `<meta property="og:title" data-rh="true" content="${escAttr(title)}" />`
  );
  html = setTag(
    html,
    /<meta\s+property="og:description"[^>]*>/,
    `<meta property="og:description" data-rh="true" content="${escAttr(desc)}" />`
  );
  html = setTag(
    html,
    /<meta\s+property="og:url"[^>]*>/,
    `<meta property="og:url" data-rh="true" content="${escAttr(url)}" />`
  );
  html = setTag(
    html,
    /<meta\s+property="og:image"[^>]*>/,
    `<meta property="og:image" data-rh="true" content="${escAttr(ogImage)}" />`
  );
  html = setTag(
    html,
    /<meta\s+name="twitter:title"[^>]*>/,
    `<meta name="twitter:title" data-rh="true" content="${escAttr(title)}" />`
  );
  html = setTag(
    html,
    /<meta\s+name="twitter:description"[^>]*>/,
    `<meta name="twitter:description" data-rh="true" content="${escAttr(desc)}" />`
  );
  html = setTag(
    html,
    /<meta\s+name="twitter:image"[^>]*>/,
    `<meta name="twitter:image" data-rh="true" content="${escAttr(ogImage)}" />`
  );

  if (route.jsonLd && route.jsonLd.length) {
    const blocks = route.jsonLd
      .map(
        (obj) =>
          `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`
      )
      .join('\n  ');
    html = html.replace('</head>', `  ${blocks}\n</head>`);
  }

  return html;
}

function writeRoute(route) {
  const html = buildHtml(route);
  const outDir = route.path === '/' ? DIST : join(DIST, route.path);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'index.html'), html, 'utf8');
  return `${route.path} -> ${outDir.replace(DIST, 'dist')}/index.html`;
}

// --- 404 page (noindex, real 404 served by Vercel for unmatched paths) ---
function write404() {
  let html = template;
  html = setTag(html, /<title>[\s\S]*?<\/title>/, `<title>Page Not Found | ${SITE_NAME}</title>`);
  // Drop the homepage canonical and tell crawlers not to index the 404 shell.
  html = html.replace(/<link\s+rel="canonical"[^>]*>/, '');
  html = setTag(
    html,
    /<meta\s+name="description"[^>]*>/,
    `<meta name="description" content="The page you are looking for does not exist." />`
  );
  html = html.replace('</head>', `  <meta name="robots" content="noindex, follow" />\n</head>`);
  writeFileSync(join(DIST, '404.html'), html, 'utf8');
}

// --- sitemap.xml with <lastmod> ---
function writeSitemap() {
  const lastmod = new Date().toISOString().slice(0, 10);
  const body = routes
    .map(
      (r) =>
        `  <url>\n    <loc>${SITE_URL}${r.path}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${r.changefreq}</changefreq>\n    <priority>${r.priority}</priority>\n  </url>`
    )
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  writeFileSync(join(DIST, 'sitemap.xml'), xml, 'utf8');
  // Keep the committed copy in sync for local/dev parity.
  if (existsSync(PUBLIC)) writeFileSync(join(PUBLIC, 'sitemap.xml'), xml, 'utf8');
}

const written = routes.map(writeRoute);
write404();
writeSitemap();

console.log('[prerender] wrote per-route HTML:');
for (const line of written) console.log('  ' + line);
console.log('[prerender] wrote dist/404.html and sitemap.xml');
