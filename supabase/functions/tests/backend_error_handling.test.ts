// @ts-ignore - Deno std library types
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { advancedContractAnalysisHandler } from "../advanced-contract-analysis/index.ts";
import { voiceTranscriptionHandler } from "../voice-transcription/index.ts";
import { generateEmbeddingsHandler } from "../generate-embeddings/index.ts";
import { processDocumentChunksHandler } from "../process-document-chunks/index.ts";

function createJsonRequest(body: unknown, options: RequestInit = {}) {
  return new Request('http://localhost', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    body: JSON.stringify(body),
    ...options,
  });
}

Deno.test('advanced contract analysis returns 400 for missing text', async () => {
  try {
    const response = await advancedContractAnalysisHandler(createJsonRequest({ analysisType: 'general' }));

    assertEquals(response.status, 400);
    const payload = await response.json();
    assertEquals(payload.success, false);
    assertEquals(payload.errorCode, 'INVALID_INPUT');
    assert(typeof payload.error === 'string');
  } finally {
    Deno.env.delete('OPENAI_API_KEY');
    Deno.env.delete('SUPABASE_URL');
    Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');
  }
});

Deno.test('voice transcription returns descriptive error for invalid action', async () => {
  try {
    Deno.env.set('OPENAI_API_KEY', 'test-key');

    const response = await voiceTranscriptionHandler(createJsonRequest({ action: 'translate' }));

    assertEquals(response.status, 400);
    const payload = await response.json();
    assertEquals(payload.success, false);
    assertEquals(payload.errorCode, 'INVALID_ACTION');
    assert(payload.error.includes('Invalid action'));
  } finally {
    Deno.env.delete('OPENAI_API_KEY');
  }
});

Deno.test('generate embeddings validates required fields', async () => {
  try {
    Deno.env.set('OPENAI_API_KEY', 'test-key');

    const response = await generateEmbeddingsHandler(createJsonRequest({ documentId: 'doc-1' }));

    assertEquals(response.status, 400);
    const payload = await response.json();
    assertEquals(payload.success, false);
    assertEquals(payload.errorCode, 'INVALID_INPUT');
    assert(payload.error.includes('Missing required parameters'));
  } finally {
    Deno.env.delete('OPENAI_API_KEY');
  }
});

Deno.test('process document chunks requires authorization header', async () => {
  try {
    Deno.env.set('OPENAI_API_KEY', 'test-key');
    Deno.env.set('SUPABASE_URL', 'https://example.supabase.co');
    Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');

    const response = await processDocumentChunksHandler(createJsonRequest({}));

    assertEquals(response.status, 401);
    const payload = await response.json();
    assertEquals(payload.success, false);
    assertEquals(payload.errorCode, 'UNAUTHORIZED');
    assert(payload.error.includes('Authorization header'));
  } finally {
    Deno.env.delete('OPENAI_API_KEY');
    Deno.env.delete('SUPABASE_URL');
    Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');
  }
});
