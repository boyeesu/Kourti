import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://example.supabase.co';
const SUPABASE_KEY = 'service-role-test-key';

test('document chunk inserts use numeric embeddings and RPC accepts arrays', async () => {
  const requests = [];

  const mockFetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    let body;

    if (init?.body) {
      try {
        body = JSON.parse(init.body);
      } catch (error) {
        body = init.body;
      }
    }

    requests.push({ url, body });

    const isRpc = url.includes('/rpc/');
    const responseBody = isRpc
      ? [{
          id: 'mock-chunk',
          document_id: null,
          contract_id: null,
          content: 'Example chunk',
          metadata: null,
          similarity: 0.95,
        }]
      : [{ id: 'mock-chunk' }];

    return new Response(JSON.stringify(responseBody), {
      status: isRpc ? 200 : 201,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { fetch: mockFetch },
  });

  const embedding = [0.11, -0.42, 0.73];

  await client.from('document_chunks').insert({
    organization_id: '00000000-0000-0000-0000-000000000000',
    chunk_index: 0,
    content: 'Lorem ipsum dolor sit amet',
    token_count: 6,
    embedding,
  });

  await client.rpc('match_document_chunks', {
    query_embedding: embedding,
    match_count: 5,
    match_threshold: 0.6,
  });

  const insertRequest = requests.find((request) =>
    request.url.includes('/rest/v1/document_chunks')
  );
  assert.ok(insertRequest, 'insert request should be captured');

  const insertedPayload = Array.isArray(insertRequest.body)
    ? insertRequest.body[0]
    : insertRequest.body;

  assert.ok(Array.isArray(insertedPayload.embedding), 'embedding should be an array');
  assert.strictEqual(
    insertedPayload.embedding[0],
    embedding[0],
    'embedding values should be preserved without serialization'
  );
  assert.strictEqual(
    typeof insertedPayload.embedding[0],
    'number',
    'embedding should contain numeric values'
  );

  const rpcRequest = requests.find((request) =>
    request.url.includes('/rpc/match_document_chunks')
  );
  assert.ok(rpcRequest, 'match_document_chunks RPC request should be captured');
  assert.deepStrictEqual(
    rpcRequest.body.query_embedding,
    embedding,
    'RPC payload should include numeric query embedding array'
  );
  assert.strictEqual(
    typeof rpcRequest.body.query_embedding[0],
    'number',
    'RPC query embedding should contain numbers'
  );
});
