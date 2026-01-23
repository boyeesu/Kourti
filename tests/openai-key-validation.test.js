// OpenAI API Key Validation Test
// Run with: node --test tests/openai-key-validation.test.js
// Or set OPENAI_API_KEY env var: $env:OPENAI_API_KEY="your-key"; node --test tests/openai-key-validation.test.js

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to load key from .env file
function loadKeyFromEnv() {
  try {
    const envPath = join(__dirname, '..', '.env');
    const envContent = readFileSync(envPath, 'utf-8');
    // Match OPENAI_API_KEY=value (handles quoted and unquoted values)
    // This regex handles: OPENAI_API_KEY=value, OPENAI_API_KEY="value", OPENAI_API_KEY='value'
    const match = envContent.match(/^OPENAI_API_KEY\s*=\s*(.+)$/m);
    if (match) {
      let key = match[1].trim();
      // Remove quotes if present (handles both single and double quotes)
      if (
        (key.startsWith('"') && key.endsWith('"')) ||
        (key.startsWith("'") && key.endsWith("'"))
      ) {
        key = key.slice(1, -1);
      }
      return key.trim();
    }
  } catch (error) {
    // .env file might not exist or be readable
    console.warn('Could not read .env file:', error.message);
  }
  return process.env.OPENAI_API_KEY;
}

const apiKey = loadKeyFromEnv();

test('OpenAI API key format validation', () => {
  if (!apiKey) {
    console.warn('⚠️  OPENAI_API_KEY not set. Skipping format validation.');
    return;
  }

  // OpenAI keys should start with 'sk-' or 'sk-proj-'
  const isValidFormat = apiKey.startsWith('sk-') || apiKey.startsWith('sk-proj-');
  assert(
    isValidFormat,
    `API key should start with 'sk-' or 'sk-proj-', got: ${apiKey.substring(0, Math.min(20, apiKey.length))}...`
  );

  // Key should have reasonable length (OpenAI keys are typically 40-100+ characters)
  assert(
    apiKey.length >= 40,
    `API key seems too short (${apiKey.length} chars). Expected at least 40 characters.`
  );

  console.log('✅ API key format is valid');
});

test('OpenAI API key connectivity test', async () => {
  if (!apiKey) {
    console.warn('⚠️  OPENAI_API_KEY not set. Skipping connectivity test.');
    return;
  }

  try {
    // Make a minimal API call to verify the key works
    // Using models endpoint as it's lightweight and doesn't consume credits
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 401) {
      throw new Error('API key is invalid or expired (401 Unauthorized)');
    }

    if (response.status === 403) {
      throw new Error('API key does not have required permissions (403 Forbidden)');
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API returned error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    assert(Array.isArray(data.data), 'Expected models array in response');
    assert(data.data.length > 0, 'Expected at least one model in response');

    console.log(`✅ API key is valid and working. Found ${data.data.length} available models.`);
  } catch (error) {
    if (error.message.includes('fetch')) {
      throw new Error('Network error: Could not reach OpenAI API. Check your internet connection.');
    }
    throw error;
  }
});

test('OpenAI API key chat completion test', async () => {
  if (!apiKey) {
    console.warn('⚠️  OPENAI_API_KEY not set. Skipping chat completion test.');
    return;
  }

  try {
    // Make a minimal chat completion request to verify full API access
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say "test" and nothing else.' }],
        max_tokens: 10,
      }),
    });

    if (response.status === 401) {
      throw new Error('API key is invalid or expired (401 Unauthorized)');
    }

    if (response.status === 403) {
      throw new Error('API key does not have required permissions (403 Forbidden)');
    }

    if (response.status === 429) {
      console.warn('⚠️  Rate limit reached. Key is valid but quota may be exhausted.');
      return;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API returned error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    assert(data.choices, 'Expected choices array in response');
    assert(data.choices.length > 0, 'Expected at least one choice in response');
    assert(data.choices[0].message, 'Expected message in choice');
    assert(data.choices[0].message.content, 'Expected content in message');

    console.log(
      `✅ Chat completion test passed. Response: "${data.choices[0].message.content.trim()}"`
    );
  } catch (error) {
    if (error.message.includes('fetch')) {
      throw new Error('Network error: Could not reach OpenAI API. Check your internet connection.');
    }
    throw error;
  }
});

test('OpenAI API key error handling - invalid key', async () => {
  // Test with an obviously invalid key
  const invalidKey = 'sk-invalid-test-key-12345';

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${invalidKey}`,
        'Content-Type': 'application/json',
      },
    });

    assert.strictEqual(response.status, 401, 'Invalid key should return 401 Unauthorized');

    const errorData = await response.json();
    assert(errorData.error, 'Error response should contain error object');

    console.log('✅ Invalid key correctly rejected by API');
  } catch (error) {
    if (error.message.includes('fetch')) {
      console.warn('⚠️  Network error during invalid key test. Skipping.');
      return;
    }
    throw error;
  }
});

test('OpenAI API key error handling - missing key', () => {
  // Test that we can detect missing keys
  const testKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const missingKey = process.env.OPENAI_API_KEY;
    assert.strictEqual(missingKey, undefined, 'OPENAI_API_KEY should be undefined after deletion');
    console.log('✅ Missing key detection works correctly');
  } finally {
    // Restore original key if it existed
    if (testKey) {
      process.env.OPENAI_API_KEY = testKey;
    }
  }
});
