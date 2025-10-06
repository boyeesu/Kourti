import test from 'node:test';
import assert from 'node:assert/strict';

import { getAuthRedirectUrl, buildDisplayName } from '../src/utils/auth-helpers.js';

test('getAuthRedirectUrl uses provided app URL', () => {
  const url = getAuthRedirectUrl('/auth/confirm', 'https://app.example.com');
  assert.equal(url, 'https://app.example.com/auth/confirm');
});

test('getAuthRedirectUrl falls back to window origin when available', () => {
  const originalWindow = globalThis.window;
  globalThis.window = { location: { origin: 'https://local.dev' } };

  const url = getAuthRedirectUrl('auth/reset', '');
  assert.equal(url, 'https://local.dev/auth/reset');

  globalThis.window = originalWindow;
});

test('buildDisplayName prioritizes first and last name', () => {
  assert.equal(buildDisplayName('Jane', 'Doe', 'jane@example.com'), 'Jane Doe');
});

test('buildDisplayName falls back to email when names missing', () => {
  assert.equal(buildDisplayName(null, null, 'jane@example.com'), 'jane@example.com');
});

