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
