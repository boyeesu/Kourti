/**
 * Provider-agnostic LLM tool-calling.
 *
 * Workloads like the redline edit-proposer or the tabular cell extractor
 * need *structured* output, not free-form prose. The provider-native way
 * to do this is "tool calls" / "function calls": you describe a JSON
 * schema, the model calls the function with arguments matching that
 * schema, and you read the parsed args off the response.
 *
 * This module exposes a single `runWithTools` helper that:
 *   1. Translates a unified `ToolDef` into the OpenAI `tools` schema and
 *      the Anthropic `tools` schema.
 *   2. Calls the configured primary provider, falls back to the other on
 *      4xx so callers don't need provider-specific code paths.
 *   3. Returns either a `tool_call` (with parsed JSON args) or `text`
 *      (free-form completion text) so callers can branch.
 *
 * Streaming is intentionally out of scope here — the existing
 * `streamChatCompletion` covers that. Tool calls are usually one-shot.
 */

import { env } from '../config/env.js';
import { ApiError } from './http.js';

// ─── Types ───────────────────────────────────────────────────────────

export type Role = 'system' | 'user' | 'assistant';

export interface Message {
  role: Role;
  content: string;
}

/** JSON Schema fragment describing the tool's args. Both providers accept
 *  draft-07-style schemas with type/properties/required. */
export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type ToolRunResult =
  | {
      kind: 'tool_call';
      tool: string;
      args: Record<string, unknown>;
      modelUsed: string;
      tokensUsed: number;
    }
  | { kind: 'text'; text: string; modelUsed: string; tokensUsed: number };

interface RunOptions {
  /** When provided, the model is told to call this specific tool. */
  forceTool?: string;
  maxTokens?: number;
}

// ─── Provider implementations ────────────────────────────────────────

async function runWithToolsAnthropic(
  messages: Message[],
  tools: ToolDef[],
  opts: RunOptions
): Promise<ToolRunResult | null> {
  if (!env.ANTHROPIC_API_KEY) return null;

  // Anthropic wants system as a separate param.
  const systemParts: string[] = [];
  const nonSystem: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of messages) {
    if (m.role === 'system') systemParts.push(m.content);
    else nonSystem.push({ role: m.role, content: m.content });
  }

  const body: Record<string, unknown> = {
    model: env.ANTHROPIC_CHAT_MODEL,
    max_tokens: opts.maxTokens ?? 4000,
    messages: nonSystem,
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    })),
  };
  if (systemParts.length) body.system = systemParts.join('\n\n');
  if (opts.forceTool) body.tool_choice = { type: 'tool', name: opts.forceTool };

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
    const text = await response.text();
    throw new Error(`Anthropic ${response.status}: ${text}`);
  }
  const data = (await response.json()) as {
    content?: Array<
      | { type: 'text'; text?: string }
      | { type: 'tool_use'; id?: string; name?: string; input?: Record<string, unknown> }
    >;
    usage?: { input_tokens?: number; output_tokens?: number };
    model?: string;
  };
  const tokensUsed = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
  const modelUsed = data.model ?? env.ANTHROPIC_CHAT_MODEL;

  for (const block of data.content ?? []) {
    if (block.type === 'tool_use' && block.name) {
      return {
        kind: 'tool_call',
        tool: block.name,
        args: (block.input ?? {}) as Record<string, unknown>,
        modelUsed,
        tokensUsed,
      };
    }
  }
  const text =
    (data.content ?? []).find((b): b is { type: 'text'; text?: string } => b.type === 'text')
      ?.text ?? '';
  return { kind: 'text', text, modelUsed, tokensUsed };
}

interface OpenAICompatibleToolConfig {
  label: 'OpenAI' | 'OpenRouter';
  baseUrl: string;
  apiKey: string | undefined;
  candidates: string[];
  extraHeaders?: Record<string, string>;
  configMissingCode: string;
  upstreamErrorCode: string;
}

async function runWithToolsOpenAICompatible(
  cfg: OpenAICompatibleToolConfig,
  messages: Message[],
  tools: ToolDef[],
  opts: RunOptions
): Promise<ToolRunResult> {
  if (!cfg.apiKey) {
    throw new ApiError(`${cfg.label} API key not configured`, 503, cfg.configMissingCode);
  }

  let lastError: string | null = null;

  for (const model of cfg.candidates) {
    const body: Record<string, unknown> = {
      model,
      messages,
      max_completion_tokens: opts.maxTokens ?? 4000,
      tools: tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
    };
    if (opts.forceTool) {
      body.tool_choice = { type: 'function', function: { name: opts.forceTool } };
    }

    const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        ...(cfg.extraHeaders ?? {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      lastError = `${response.status}: ${text}`;
      // 4xx = model-incompat; try the next candidate. 5xx = stop, surface.
      if ([400, 404, 422].includes(response.status)) continue;
      break;
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{
            id?: string;
            type?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
      usage?: { total_tokens?: number };
    };
    const choice = data.choices?.[0]?.message;
    const tokensUsed = data.usage?.total_tokens ?? 0;

    const toolCall = choice?.tool_calls?.[0];
    if (toolCall?.function?.name) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(toolCall.function.arguments ?? '{}');
      } catch {
        // Provider sometimes returns malformed JSON for very long args; fall
        // through with empty args rather than 500ing.
      }
      return {
        kind: 'tool_call',
        tool: toolCall.function.name,
        args,
        modelUsed: model,
        tokensUsed,
      };
    }
    return {
      kind: 'text',
      text: choice?.content ?? '',
      modelUsed: model,
      tokensUsed,
    };
  }

  throw new ApiError(
    `${cfg.label} tool-call request failed (${lastError ?? 'unknown'})`,
    502,
    cfg.upstreamErrorCode
  );
}

function runWithToolsOpenAI(messages: Message[], tools: ToolDef[], opts: RunOptions) {
  return runWithToolsOpenAICompatible(
    {
      label: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: env.OPENAI_API_KEY,
      candidates: Array.from(new Set([env.OPENAI_CHAT_MODEL, env.OPENAI_FALLBACK_CHAT_MODEL])),
      configMissingCode: 'OPENAI_CONFIG_MISSING',
      upstreamErrorCode: 'OPENAI_UPSTREAM_ERROR',
    },
    messages,
    tools,
    opts
  );
}

async function runWithToolsOpenRouter(
  messages: Message[],
  tools: ToolDef[],
  opts: RunOptions
): Promise<ToolRunResult | null> {
  if (!env.OPENROUTER_API_KEY) return null;
  return runWithToolsOpenAICompatible(
    {
      label: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: env.OPENROUTER_API_KEY,
      candidates: Array.from(
        new Set([env.OPENROUTER_CHAT_MODEL, env.OPENROUTER_FALLBACK_CHAT_MODEL])
      ),
      extraHeaders: {
        ...(env.APP_URL ? { 'HTTP-Referer': env.APP_URL } : {}),
        'X-Title': env.OPENROUTER_APP_NAME,
      },
      configMissingCode: 'OPENROUTER_CONFIG_MISSING',
      upstreamErrorCode: 'OPENROUTER_UPSTREAM_ERROR',
    },
    messages,
    tools,
    opts
  );
}

// ─── Public entry point ──────────────────────────────────────────────

/**
 * Run a chat completion with one or more tools available.
 *
 * Returns either a `tool_call` (preferred — args are parsed) or `text`
 * (free-form). With `forceTool`, the model is required to call that
 * specific tool — you can rely on `kind === 'tool_call'`.
 *
 * Falls back across providers on 4xx, mirroring `requestChatCompletion`.
 */
export async function runWithTools(
  messages: Message[],
  tools: ToolDef[],
  opts: RunOptions = {}
): Promise<ToolRunResult> {
  const allProviders = {
    anthropic: runWithToolsAnthropic,
    openai: runWithToolsOpenAI,
    openrouter: runWithToolsOpenRouter,
  } as const;
  const primary = env.LLM_PRIMARY_PROVIDER;
  const order = [
    allProviders[primary],
    ...(['anthropic', 'openai', 'openrouter'] as const)
      .filter((p) => p !== primary)
      .map((p) => allProviders[p]),
  ] as const;

  for (const provider of order) {
    try {
      const result = await provider(messages, tools, opts);
      if (result) return result;
    } catch (err) {
      if (provider === order[order.length - 1]) throw err;
      console.warn(
        '[LLM tools] Primary provider failed, falling back:',
        err instanceof Error ? err.message : err
      );
    }
  }

  throw new ApiError('All LLM providers failed', 502, 'LLM_ALL_PROVIDERS_FAILED');
}
