// @ts-ignore - Deno std library types
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { advancedContractAnalysisHandler } from "../advanced-contract-analysis/index.ts";
import { voiceTranscriptionHandler } from "../voice-transcription/index.ts";

function createJsonRequest(body: unknown) {
  return new Request('http://localhost', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

Deno.test('advanced contract analysis falls back when the primary model fails', async () => {
  const originalFetch = globalThis.fetch;
  const modelsTried: string[] = [];

  globalThis.fetch = async (input: Request | URL | string, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (url.includes('/chat/completions')) {
      const body = JSON.parse(init?.body as string);
      modelsTried.push(body.model);

      if (body.model === 'bad-model') {
        return new Response(JSON.stringify({
          error: { message: 'The model `bad-model` does not exist.' }
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Fallback analysis' } }],
        usage: { total_tokens: 128 },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch call to ${url}`);
  };

  try {
    Deno.env.set('OPENAI_API_KEY', 'test-key');
    Deno.env.set('SUPABASE_URL', 'https://example.supabase.co');
    Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    Deno.env.set('OPENAI_CHAT_MODEL', 'bad-model');
    Deno.env.set('OPENAI_FALLBACK_CHAT_MODEL', 'gpt-4o-mini');

    const response = await advancedContractAnalysisHandler(createJsonRequest({
      text: 'Agreement between Alpha and Beta',
      analysisType: 'general',
    }));

    assertEquals(response.status, 200);
    const payload = await response.json();
    assert(payload.success);
    assertEquals(payload.analysis, 'Fallback analysis');
    assertEquals(payload.modelUsed, 'gpt-4o-mini');
    assertEquals(modelsTried, ['bad-model', 'gpt-4o-mini']);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete('OPENAI_API_KEY');
    Deno.env.delete('SUPABASE_URL');
    Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');
    Deno.env.delete('OPENAI_CHAT_MODEL');
    Deno.env.delete('OPENAI_FALLBACK_CHAT_MODEL');
  }
});

Deno.test('voice transcription summarization succeeds with configured model', async () => {
  const originalFetch = globalThis.fetch;
  const modelsTried: string[] = [];

  globalThis.fetch = async (input: Request | URL | string, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (url.includes('/chat/completions')) {
      const body = JSON.parse(init?.body as string);
      modelsTried.push(body.model);

      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Summary of transcript' } }],
        usage: { total_tokens: 64 },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch call to ${url}`);
  };

  try {
    Deno.env.set('OPENAI_API_KEY', 'test-key');
    Deno.env.set('OPENAI_CHAT_MODEL', 'gpt-4.1-mini');
    Deno.env.set('OPENAI_FALLBACK_CHAT_MODEL', 'gpt-4o-mini');

    const response = await voiceTranscriptionHandler(createJsonRequest({
      action: 'summarize',
      transcript: 'This is a transcript of court proceedings.',
    }));

    assertEquals(response.status, 200);
    const payload = await response.json();
    assert(payload.success);
    assertEquals(payload.summary, 'Summary of transcript');
    assertEquals(payload.modelUsed, 'gpt-4.1-mini');
    assertEquals(modelsTried, ['gpt-4.1-mini']);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete('OPENAI_API_KEY');
    Deno.env.delete('OPENAI_CHAT_MODEL');
    Deno.env.delete('OPENAI_FALLBACK_CHAT_MODEL');
  }
});
