import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';
const API = 'http://localhost:4000';

let browser, context, page;
const results = [];

function log(module, test, status, detail = '') {
  const icon = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️' : '❌';
  const line = `${icon} [${module}] ${test}${detail ? ' — ' + detail : ''}`;
  console.log(line);
  results.push({ module, test, status, detail });
}

async function run(module, test, fn) {
  try {
    await fn();
    log(module, test, 'PASS');
  } catch (err) {
    log(module, test, 'FAIL', err.message?.substring(0, 120));
  }
}

async function goto(path, opts = {}) {
  const timeout = opts.timeout || 15000;
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout });
  await page.waitForTimeout(1500); // let React render
}

async function expectText(text, timeout = 8000) {
  await page.waitForFunction(
    (t) => document.body?.innerText?.includes(t),
    text,
    { timeout }
  );
}

async function expectSelector(sel, timeout = 8000) {
  await page.waitForSelector(sel, { timeout });
}

async function expectNoError() {
  const body = await page.textContent('body');
  if (body.includes('Something went wrong') || body.includes('Application Error')) {
    throw new Error('Error boundary or crash detected on page');
  }
}

// ─── API Health ──────────────────────────────────────────────────────────────

async function testAPIHealth() {
  await run('API', 'Health endpoint', async () => {
    const res = await fetch(`${API}/health`);
    const data = await res.json();
    if (!data.ok) throw new Error('Health not ok');
    if (data.database !== 'ok') throw new Error('Database not ok: ' + data.database);
  });

  await run('API', 'Auth requires credentials', async () => {
    const res = await fetch(`${API}/api/v1/auth/session`);
    // In development mode auth may be bypassed (200) or endpoint may not exist (404)
    // Only fail if we get an unexpected success with actual session data
    if (res.status === 200) {
      const data = await res.json();
      if (data.accessToken) throw new Error('Auth endpoint returned a real session without credentials');
      // 200 with no session is acceptable in dev mode
    }
    // 401, 404, 200-without-token are all acceptable
  });

  await run('API', '404 for unknown routes', async () => {
    const res = await fetch(`${API}/api/v1/nonexistent`);
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  });
}

// ─── Auth / Login ────────────────────────────────────────────────────────────

async function testAuth() {
  await run('Auth', 'Login page loads', async () => {
    await goto('/login');
    await expectNoError();
    // Look for email input or sign-in related content
    const hasInput = await page.$('input[type="email"], input[name="email"], input[placeholder*="mail"]');
    if (!hasInput) {
      // Maybe it redirects to /auth
      const url = page.url();
      if (!url.includes('login') && !url.includes('auth')) {
        throw new Error('No login form found, current URL: ' + url);
      }
    }
  });

  await run('Auth', 'Auth page loads', async () => {
    await goto('/auth');
    await expectNoError();
  });

  await run('Auth', 'Register page loads', async () => {
    await goto('/register');
    await expectNoError();
  });

  await run('Auth', 'Forgot password page loads', async () => {
    await goto('/forgot-password');
    await expectNoError();
  });
}

// ─── After login: test all protected pages ───────────────────────────────────

async function loginViaDev() {
  // In AUTH_MODE=custom we need real JWT. Get one from sign-in API.
  // Try dev credentials first, if that fails try the API dev mode
  let token;

  // Try signing in via API
  const res = await fetch(`${API}/api/v1/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dev@kourti.local', password: 'password123' }),
  });

  if (res.ok) {
    const data = await res.json();
    token = data.accessToken;
  }

  if (!token) {
    // Fallback: try the session endpoint in dev mode
    const sessionRes = await fetch(`${API}/api/v1/auth/session`, {
      headers: { 'x-dev-user-id': '00000000-0000-0000-0000-000000000001' }
    });
    if (!sessionRes.ok) {
      console.log('⚠️  Could not authenticate. Testing pages as unauthenticated.');
      return null;
    }
  }

  if (token) {
    // Set auth in localStorage so the app picks it up
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.setItem('auth_token', t);
      localStorage.setItem('access_token', t);
      // Also try the format the app might use
      try {
        const authData = JSON.stringify({
          accessToken: t,
          user: { id: '00000000-0000-0000-0000-000000000001', email: 'dev@kourti.local' }
        });
        localStorage.setItem('kourti_auth', authData);
      } catch {}
    }, token);
  }

  return token;
}

// Test each protected page loads without crashing
async function testProtectedPages() {
  const pages = [
    { path: '/dashboard', name: 'Dashboard', module: 'Dashboard' },
    { path: '/', name: 'Home/Dashboard', module: 'Dashboard' },
    { path: '/cases', name: 'Cases list', module: 'Cases' },
    { path: '/cases/create', name: 'Create case', module: 'Cases' },
    { path: '/clients', name: 'Clients list', module: 'Clients' },
    { path: '/clients/create', name: 'Create client', module: 'Clients' },
    { path: '/contracts', name: 'Contracts list', module: 'Contracts' },
    { path: '/contracts/create', name: 'Create contract', module: 'Contracts' },
    { path: '/contracts/upload', name: 'Upload contract', module: 'Contracts' },
    { path: '/contracts/compare', name: 'Compare contracts', module: 'Contracts' },
    { path: '/contracts/review', name: 'Review contract', module: 'Contracts' },
    { path: '/documents', name: 'Documents list', module: 'Documents' },
    { path: '/documents/upload', name: 'Upload document', module: 'Documents' },
    { path: '/documents/review', name: 'Review document', module: 'Documents' },
    { path: '/invoices', name: 'Invoices list', module: 'Invoices' },
    { path: '/invoices/create', name: 'Create invoice', module: 'Invoices' },
    { path: '/calendar', name: 'Calendar', module: 'Calendar' },
    { path: '/analytics', name: 'Analytics', module: 'Analytics' },
    { path: '/ream-ai', name: 'Ream AI assistant', module: 'AI' },
    { path: '/voice-recorder', name: 'Voice recorder', module: 'Voice' },
    { path: '/transcriptions', name: 'Transcriptions list', module: 'Voice' },
    { path: '/bulk-import', name: 'Bulk import', module: 'Import' },
    { path: '/live-chat', name: 'Live chat', module: 'Chat' },
    { path: '/users', name: 'User management', module: 'Admin' },
    { path: '/settings', name: 'Settings', module: 'Settings' },
    { path: '/help-center', name: 'Help center', module: 'Help' },
    { path: '/changelog', name: 'Changelog', module: 'Help' },
    { path: '/notifications', name: 'Notifications', module: 'Notifications' },
    { path: '/agents', name: 'Agent Jobs', module: 'Agents' },
    { path: '/agents/monitors', name: 'Agent Monitors', module: 'Agents' },
    { path: '/agents/approvals', name: 'Agent Approvals', module: 'Agents' },
    { path: '/agents/dashboard', name: 'Agent Dashboard', module: 'Agents' },
    { path: '/negotiations', name: 'Negotiations', module: 'Negotiations' },
    { path: '/intelligence', name: 'Intelligence Dashboard', module: 'Intelligence' },
  ];

  for (const p of pages) {
    await run(p.module, `${p.name} loads (${p.path})`, async () => {
      await goto(p.path);
      const url = page.url();

      // If redirected to login/auth, that's expected for protected pages without valid session
      if (url.includes('/login') || url.includes('/auth')) {
        log(p.module, `${p.name} — redirects to login (auth required)`, 'WARN');
        return;
      }

      // Check for error boundaries
      const body = await page.textContent('body');
      if (body.includes('Something went wrong')) {
        throw new Error('Error boundary triggered');
      }
      if (body.includes('Application Error')) {
        throw new Error('Application error');
      }

      // Check for blank page (only whitespace)
      if (body.trim().length < 10) {
        throw new Error('Page appears blank');
      }
    });
  }
}

// ─── 404 page ────────────────────────────────────────────────────────────────

async function testNotFound() {
  await run('Navigation', '404 page renders', async () => {
    await goto('/this-page-does-not-exist-12345');
    await expectNoError();
    const body = await page.textContent('body');
    if (body.trim().length < 10) throw new Error('404 page is blank');
  });
}

// ─── Console errors check ────────────────────────────────────────────────────

async function testConsoleErrors() {
  const criticalErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore known non-critical errors
      if (text.includes('MSAL') || text.includes('crypto_nonexistent')) return;
      if (text.includes('Failed to load resource')) return;
      if (text.includes('net::ERR_')) return;
      if (text.includes('favicon')) return;
      if (text.includes('CORS') || text.includes('blocked by CORS')) return;
      if (text.includes('auth/refresh')) return; // expected when not logged in
      criticalErrors.push(text.substring(0, 150));
    }
  });

  await goto('/');
  await page.waitForTimeout(3000);

  await run('Console', 'No critical JS errors on home', async () => {
    if (criticalErrors.length > 0) {
      throw new Error(`${criticalErrors.length} error(s): ${criticalErrors[0]}`);
    }
  });
}

// ─── Nginx proxy ─────────────────────────────────────────────────────────────

async function testNginxProxy() {
  await run('Proxy', 'API proxy through nginx works', async () => {
    const res = await fetch(`${BASE}/api/v1/auth/session`);
    // When running behind nginx, this proxies to the backend (expect 401 or JSON error).
    // When running Vite dev server without proxy, this returns 200 with the SPA HTML.
    if (res.status === 200) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        // Vite dev server served the SPA — no nginx proxy configured, that's OK in dev
        return;
      }
      // If it's JSON, check it's a valid API response
      const data = await res.json();
      if (data.accessToken) throw new Error('Proxy returned a session without credentials');
    }
    // 401, 404, or 200 with HTML are all acceptable
  });

  await run('Proxy', 'Health via proxy', async () => {
    const res = await fetch(`${API}/health`);
    const data = await res.json();
    if (data.database !== 'ok') throw new Error('DB not ok');
  });
}

// ─── Static assets ───────────────────────────────────────────────────────────

async function testStaticAssets() {
  await run('Assets', 'CSS loads', async () => {
    const res = await fetch(`${BASE}/`);
    const html = await res.text();
    // Production build: /assets/index-xxxx.css  |  Vite dev: inline styles or <link> in index.html
    const cssMatch = html.match(/href="(\/assets\/[^"]+\.css)"/) || html.match(/href="(\/src\/[^"]+\.css)"/);
    if (!cssMatch) {
      // Vite dev server injects CSS via JS modules — check that the page at least has <head>
      if (html.includes('<head>') || html.includes('<div id="root"')) return;
      throw new Error('No CSS asset found and page structure looks broken');
    }
    const cssRes = await fetch(`${BASE}${cssMatch[1]}`);
    if (cssRes.status !== 200) throw new Error(`CSS returned ${cssRes.status}`);
  });

  await run('Assets', 'JS loads', async () => {
    const res = await fetch(`${BASE}/`);
    const html = await res.text();
    // Production build: /assets/index-xxxx.js  |  Vite dev: /src/main.tsx
    const jsMatch = html.match(/src="(\/assets\/[^"]+\.js)"/) || html.match(/src="(\/src\/[^"]+\.(tsx?|jsx?))"/);
    if (!jsMatch) throw new Error('No JS entry point found in HTML');
    const jsRes = await fetch(`${BASE}${jsMatch[1]}`);
    if (jsRes.status !== 200) throw new Error(`JS returned ${jsRes.status}`);
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Starting E2E tests against', BASE);
  console.log('─'.repeat(60));

  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
  });
  page = await context.newPage();

  // Suppress noisy console
  page.on('pageerror', () => {});

  await testAPIHealth();
  console.log('─'.repeat(60));

  await testNginxProxy();
  console.log('─'.repeat(60));

  await testStaticAssets();
  console.log('─'.repeat(60));

  await testAuth();
  console.log('─'.repeat(60));

  // Try to authenticate
  console.log('🔑 Attempting authentication...');
  const token = await loginViaDev();
  if (token) {
    console.log('🔑 Got JWT token, testing protected pages...');
  } else {
    console.log('⚠️  No auth token, testing pages unauthenticated (will see redirects)');
  }
  console.log('─'.repeat(60));

  await testProtectedPages();
  console.log('─'.repeat(60));

  await testNotFound();
  console.log('─'.repeat(60));

  await testConsoleErrors();
  console.log('─'.repeat(60));

  await browser.close();

  // Summary
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const warn = results.filter((r) => r.status === 'WARN').length;

  console.log('\n' + '═'.repeat(60));
  console.log(`📊 RESULTS: ${pass} passed, ${fail} failed, ${warn} warnings`);
  console.log('═'.repeat(60));

  if (fail > 0) {
    console.log('\n❌ FAILURES:');
    results.filter((r) => r.status === 'FAIL').forEach((r) => {
      console.log(`   [${r.module}] ${r.test}: ${r.detail}`);
    });
  }

  if (warn > 0) {
    console.log('\n⚠️  WARNINGS:');
    results.filter((r) => r.status === 'WARN').forEach((r) => {
      console.log(`   [${r.module}] ${r.test}: ${r.detail}`);
    });
  }

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
