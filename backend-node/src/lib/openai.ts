import { env } from '../config/env.js';
import { ApiError } from './http.js';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

function getModelCandidates() {
  return Array.from(new Set([env.OPENAI_CHAT_MODEL, env.OPENAI_FALLBACK_CHAT_MODEL]));
}

export async function requestChatCompletion(messages: ChatMessage[], maxTokens = 4000) {
  if (!env.OPENAI_API_KEY) {
    throw new ApiError('OpenAI API key not configured', 503, 'OPENAI_CONFIG_MISSING');
  }

  const models = getModelCandidates();
  let lastError: string | null = null;

  for (const model of models) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_completion_tokens: maxTokens,
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { total_tokens?: number };
      };

      const content = data.choices?.[0]?.message?.content;
      if (!content || !content.trim()) {
        throw new ApiError('Empty analysis content from OpenAI', 502, 'OPENAI_EMPTY_RESPONSE');
      }

      return {
        analysis: content,
        tokensUsed: data.usage?.total_tokens ?? 0,
        modelUsed: model,
      };
    }

    const errorText = await response.text();
    lastError = `${response.status}: ${errorText}`;
    if ([400, 404, 422].includes(response.status)) {
      continue;
    }
    break;
  }

  throw new ApiError(
    `OpenAI request failed (${lastError || 'unknown'})`,
    502,
    'OPENAI_UPSTREAM_ERROR'
  );
}

/**
 * Generate an embedding vector for the given text using OpenAI's embedding model.
 */
export async function generateEmbedding(
  text: string,
  model = 'text-embedding-3-small'
): Promise<number[]> {
  if (!env.OPENAI_API_KEY) {
    throw new ApiError('OpenAI API key not configured', 503, 'OPENAI_CONFIG_MISSING');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input: text }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(
      `Embedding request failed: ${response.status}: ${errorText}`,
      502,
      'OPENAI_UPSTREAM_ERROR'
    );
  }

  const data = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };

  const embedding = data.data?.[0]?.embedding;
  if (!embedding) {
    throw new ApiError('No embedding returned from OpenAI', 502, 'OPENAI_EMPTY_RESPONSE');
  }

  return embedding;
}

/**
 * Generate embeddings for multiple texts in a single batch request.
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  model = 'text-embedding-3-small'
): Promise<number[][]> {
  if (!env.OPENAI_API_KEY) {
    throw new ApiError('OpenAI API key not configured', 503, 'OPENAI_CONFIG_MISSING');
  }

  if (texts.length === 0) return [];

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input: texts }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(
      `Batch embedding request failed: ${response.status}: ${errorText}`,
      502,
      'OPENAI_UPSTREAM_ERROR'
    );
  }

  const data = (await response.json()) as {
    data?: Array<{ embedding?: number[]; index: number }>;
  };

  if (!data.data?.length) {
    throw new ApiError('No embeddings returned from OpenAI', 502, 'OPENAI_EMPTY_RESPONSE');
  }

  // Sort by index to maintain input order
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding!);
}

/**
 * Stream a chat completion via SSE. Calls `onChunk` for each token delta and
 * returns the full accumulated text + usage when finished.
 */
export async function streamChatCompletion(
  messages: ChatMessage[],
  onChunk: (delta: string) => void,
  maxTokens = 3000
): Promise<{ analysis: string; tokensUsed: number; modelUsed: string }> {
  if (!env.OPENAI_API_KEY) {
    throw new ApiError('OpenAI API key not configured', 503, 'OPENAI_CONFIG_MISSING');
  }

  const models = getModelCandidates();
  let lastError: string | null = null;

  for (const model of models) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_completion_tokens: maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      lastError = `${response.status}: ${errorText}`;
      if ([400, 404, 422].includes(response.status)) {
        continue;
      }
      break;
    }

    // Parse the SSE stream from OpenAI
    const reader = response.body?.getReader();
    if (!reader) {
      throw new ApiError('No response body from OpenAI', 502, 'OPENAI_EMPTY_RESPONSE');
    }

    const decoder = new TextDecoder();
    let fullContent = '';
    let tokensUsed = 0;
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last potentially-incomplete line in buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') continue;

        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
            usage?: { total_tokens?: number };
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            onChunk(delta);
          }
          if (parsed.usage?.total_tokens) {
            tokensUsed = parsed.usage.total_tokens;
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    if (!fullContent.trim()) {
      throw new ApiError('Empty analysis content from OpenAI', 502, 'OPENAI_EMPTY_RESPONSE');
    }

    return { analysis: fullContent, tokensUsed, modelUsed: model };
  }

  throw new ApiError(
    `OpenAI request failed (${lastError || 'unknown'})`,
    502,
    'OPENAI_UPSTREAM_ERROR'
  );
}
