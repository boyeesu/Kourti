import test from 'node:test';
import assert from 'node:assert/strict';

const apiKey = process.env.OPENAI_API_KEY;
const runLiveTests = process.env.RUN_LIVE_OPENAI_TESTS === 'true';

test('OpenAI key format validation (unit)', () => {
  if (!apiKey) {
    return;
  }

  const isValidPrefix = apiKey.startsWith('sk-') || apiKey.startsWith('sk-proj-');
  assert.ok(isValidPrefix, 'OPENAI_API_KEY should start with sk- or sk-proj-');
  assert.ok(apiKey.length >= 40, 'OPENAI_API_KEY should be at least 40 characters long');
});

test('Live OpenAI tests are opt-in', () => {
  if (!runLiveTests) {
    assert.ok(true, 'Live OpenAI tests are disabled by default');
    return;
  }

  assert.ok(apiKey, 'RUN_LIVE_OPENAI_TESTS=true requires OPENAI_API_KEY to be set');
});

test(
  'OpenAI connectivity check (integration, optional)',
  { skip: !runLiveTests || !apiKey },
  async () => {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    assert.notStrictEqual(response.status, 401, 'API key should not be unauthorized');
    assert.notStrictEqual(response.status, 403, 'API key should have required permissions');
    assert.ok(response.ok, `Expected 2xx response, got ${response.status}`);

    const data = await response.json();
    assert.ok(Array.isArray(data.data), 'Expected models array in response');
  }
);
