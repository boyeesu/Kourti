import { env } from '../config/env.js';
import { ApiError } from './http.js';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getOpenAIModelCandidates() {
  return Array.from(new Set([env.OPENAI_CHAT_MODEL, env.OPENAI_FALLBACK_CHAT_MODEL]));
}

/** Split a ChatMessage[] into an Anthropic-compatible { system, messages } pair. */
function toAnthropicMessages(messages: ChatMessage[]) {
  const systemParts: string[] = [];
  const nonSystem: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(m.content);
    } else {
      nonSystem.push({ role: m.role, content: m.content });
    }
  }

  return { system: systemParts.join('\n\n') || undefined, messages: nonSystem };
}

// ---------------------------------------------------------------------------
// Anthropic chat completion (non-streaming)
// ---------------------------------------------------------------------------

async function requestAnthropicCompletion(messages: ChatMessage[], maxTokens: number) {
  if (!env.ANTHROPIC_API_KEY) return null;

  const { system, messages: anthropicMessages } = toAnthropicMessages(messages);

  const body: Record<string, unknown> = {
    model: env.ANTHROPIC_CHAT_MODEL,
    max_tokens: maxTokens,
    messages: anthropicMessages,
  };
  if (system) body.system = system;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': env.ANTHROPIC_API_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
    model?: string;
  };

  const content = data.content?.find((b) => b.type === 'text')?.text;
  if (!content?.trim()) {
    throw new Error('Empty response from Anthropic');
  }

  const tokensUsed = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
  return { analysis: content, tokensUsed, modelUsed: data.model ?? env.ANTHROPIC_CHAT_MODEL };
}

// ---------------------------------------------------------------------------
// OpenAI chat completion (non-streaming)
// ---------------------------------------------------------------------------

async function requestOpenAICompletion(messages: ChatMessage[], maxTokens: number) {
  if (!env.OPENAI_API_KEY) {
    throw new ApiError('OpenAI API key not configured', 503, 'OPENAI_CONFIG_MISSING');
  }

  const models = getOpenAIModelCandidates();
  let lastError: string | null = null;

  for (const model of models) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages, max_completion_tokens: maxTokens }),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { total_tokens?: number };
      };

      const content = data.choices?.[0]?.message?.content;
      if (!content?.trim()) {
        throw new ApiError('Empty analysis content from OpenAI', 502, 'OPENAI_EMPTY_RESPONSE');
      }

      return { analysis: content, tokensUsed: data.usage?.total_tokens ?? 0, modelUsed: model };
    }

    const errorText = await response.text();
    lastError = `${response.status}: ${errorText}`;
    if ([400, 404, 422].includes(response.status)) continue;
    break;
  }

  throw new ApiError(
    `OpenAI request failed (${lastError || 'unknown'})`,
    502,
    'OPENAI_UPSTREAM_ERROR'
  );
}

// ---------------------------------------------------------------------------
// Public: chat completion with provider fallback
// ---------------------------------------------------------------------------

export async function requestChatCompletion(messages: ChatMessage[], maxTokens = 4000) {
  const providers =
    env.LLM_PRIMARY_PROVIDER === 'anthropic'
      ? ([requestAnthropicCompletion, requestOpenAICompletion] as const)
      : ([requestOpenAICompletion, requestAnthropicCompletion] as const);

  for (const provider of providers) {
    try {
      const result = await provider(messages, maxTokens);
      if (result) return result;
    } catch (err) {
      // If this is the last provider, rethrow
      if (provider === providers[providers.length - 1]) throw err;
      // Otherwise log and try the next provider
      console.warn(
        `[LLM] Primary provider failed, falling back:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  throw new ApiError('All LLM providers failed', 502, 'LLM_ALL_PROVIDERS_FAILED');
}

// ---------------------------------------------------------------------------
// Anthropic streaming chat completion
// ---------------------------------------------------------------------------

async function streamAnthropicCompletion(
  messages: ChatMessage[],
  onChunk: (delta: string) => void,
  maxTokens: number
) {
  if (!env.ANTHROPIC_API_KEY) return null;

  const { system, messages: anthropicMessages } = toAnthropicMessages(messages);

  const body: Record<string, unknown> = {
    model: env.ANTHROPIC_CHAT_MODEL,
    max_tokens: maxTokens,
    messages: anthropicMessages,
    stream: true,
  };
  if (system) body.system = system;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': env.ANTHROPIC_API_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic ${response.status}: ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body from Anthropic');

  const decoder = new TextDecoder();
  let fullContent = '';
  let tokensUsed = 0;
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const payload = trimmed.slice(6);

      try {
        const parsed = JSON.parse(payload) as {
          type?: string;
          delta?: { type?: string; text?: string };
          usage?: { input_tokens?: number; output_tokens?: number };
        };

        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          fullContent += parsed.delta.text;
          onChunk(parsed.delta.text);
        }

        if (parsed.type === 'message_delta' && parsed.usage) {
          tokensUsed = (parsed.usage.input_tokens ?? 0) + (parsed.usage.output_tokens ?? 0);
        }
      } catch {
        // Skip malformed JSON lines
      }
    }
  }

  if (!fullContent.trim()) throw new Error('Empty streaming response from Anthropic');

  return {
    analysis: fullContent,
    tokensUsed,
    modelUsed: env.ANTHROPIC_CHAT_MODEL,
  };
}

// ---------------------------------------------------------------------------
// OpenAI streaming chat completion
// ---------------------------------------------------------------------------

async function streamOpenAICompletion(
  messages: ChatMessage[],
  onChunk: (delta: string) => void,
  maxTokens: number
) {
  if (!env.OPENAI_API_KEY) {
    throw new ApiError('OpenAI API key not configured', 503, 'OPENAI_CONFIG_MISSING');
  }

  const models = getOpenAIModelCandidates();
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
      if ([400, 404, 422].includes(response.status)) continue;
      break;
    }

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

// ---------------------------------------------------------------------------
// Public: streaming chat completion with provider fallback
// ---------------------------------------------------------------------------

export async function streamChatCompletion(
  messages: ChatMessage[],
  onChunk: (delta: string) => void,
  maxTokens = 3000
): Promise<{ analysis: string; tokensUsed: number; modelUsed: string }> {
  const providers =
    env.LLM_PRIMARY_PROVIDER === 'anthropic'
      ? ([streamAnthropicCompletion, streamOpenAICompletion] as const)
      : ([streamOpenAICompletion, streamAnthropicCompletion] as const);

  for (const provider of providers) {
    try {
      const result = await provider(messages, onChunk, maxTokens);
      if (result) return result;
    } catch (err) {
      if (provider === providers[providers.length - 1]) throw err;
      console.warn(
        `[LLM] Primary streaming provider failed, falling back:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  throw new ApiError('All LLM providers failed', 502, 'LLM_ALL_PROVIDERS_FAILED');
}

// ---------------------------------------------------------------------------
// Embeddings (OpenAI-only — Anthropic does not offer an embeddings API)
// ---------------------------------------------------------------------------

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

  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding!);
}
