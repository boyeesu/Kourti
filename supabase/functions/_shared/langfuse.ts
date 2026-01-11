declare const Deno: any;

/**
 * Shared Langfuse client for tracing AI service calls in Deno edge functions
 * Uses Langfuse JS SDK via esm.sh for Deno compatibility
 */

interface LangfuseConfig {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
}

interface TraceOptions {
  name: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

interface GenerationOptions {
  name: string;
  model: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

let langfuseClient: any = null;

/**
 * Initialize Langfuse client from environment variables
 */
function getLangfuseClient() {
  if (langfuseClient) {
    return langfuseClient;
  }

  const publicKey = Deno.env.get('LANGFUSE_PUBLIC_KEY');
  const secretKey = Deno.env.get('LANGFUSE_SECRET_KEY');
  const baseUrl = Deno.env.get('LANGFUSE_HOST') || 'https://cloud.langfuse.com';

  if (!publicKey || !secretKey) {
    console.warn('Langfuse credentials not configured. Tracing will be disabled.');
    return null;
  }

  try {
    // Import Langfuse SDK dynamically for Deno
    // Using fetch-based API since we can't use npm packages directly in Deno
    langfuseClient = {
      publicKey,
      secretKey,
      baseUrl,
    };
    return langfuseClient;
  } catch (error) {
    console.error('Failed to initialize Langfuse client:', error);
    return null;
  }
}

/**
 * Create a trace and return trace ID
 */
export async function createTrace(options: TraceOptions): Promise<string | null> {
  const client = getLangfuseClient();
  if (!client) {
    return null;
  }

  try {
    const traceId = crypto.randomUUID();
    const traceData = {
      id: traceId,
      name: options.name,
      userId: options.userId,
      sessionId: options.sessionId,
      metadata: options.metadata || {},
      tags: options.tags || [],
      timestamp: new Date().toISOString(),
    };

    // Send trace creation to Langfuse API
    const response = await fetch(`${client.baseUrl}/api/public/traces`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${client.publicKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(traceData),
    }).catch(err => {
      console.error('Failed to send trace to Langfuse:', err);
      return null;
    });

    if (response && !response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`Langfuse trace creation failed: ${response.status} - ${errorText}`);
    }

    return traceId;
  } catch (error) {
    console.error('Error creating Langfuse trace:', error);
    return null;
  }
}

/**
 * Create a generation observation (for LLM calls)
 */
export async function createGeneration(
  traceId: string | null,
  options: GenerationOptions
): Promise<string | null> {
  const client = getLangfuseClient();
  if (!client || !traceId) {
    return null;
  }

  try {
    const generationId = crypto.randomUUID();
    const generationData = {
      id: generationId,
      traceId,
      name: options.name,
      model: options.model,
      modelParameters: {},
      input: options.input,
      output: options.output,
      metadata: options.metadata || {},
      usage: options.usage || {},
      timestamp: new Date().toISOString(),
    };

    // Send generation to Langfuse API
    const response = await fetch(`${client.baseUrl}/api/public/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${client.publicKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(generationData),
    }).catch(err => {
      console.error('Failed to send generation to Langfuse:', err);
      return null;
    });

    if (response && !response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`Langfuse generation creation failed: ${response.status} - ${errorText}`);
    }

    return generationId;
  } catch (error) {
    console.error('Error creating Langfuse generation:', error);
    return null;
  }
}

/**
 * Create a span observation (for non-LLM operations like embeddings)
 */
export async function createSpan(
  traceId: string | null,
  options: {
    name: string;
    input?: unknown;
    output?: unknown;
    metadata?: Record<string, unknown>;
  }
): Promise<string | null> {
  const client = getLangfuseClient();
  if (!client || !traceId) {
    return null;
  }

  try {
    const spanId = crypto.randomUUID();
    const spanData = {
      id: spanId,
      traceId,
      name: options.name,
      input: options.input,
      output: options.output,
      metadata: options.metadata || {},
      timestamp: new Date().toISOString(),
    };

    // Send span to Langfuse API
    const response = await fetch(`${client.baseUrl}/api/public/spans`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${client.publicKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(spanData),
    }).catch(err => {
      console.error('Failed to send span to Langfuse:', err);
      return null;
    });

    if (response && !response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`Langfuse span creation failed: ${response.status} - ${errorText}`);
    }

    return spanId;
  } catch (error) {
    console.error('Error creating Langfuse span:', error);
    return null;
  }
}

/**
 * Update a generation with output and usage
 */
export async function updateGeneration(
  generationId: string | null,
  options: {
    output?: unknown;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const client = getLangfuseClient();
  if (!client || !generationId) {
    return;
  }

  try {
    const response = await fetch(`${client.baseUrl}/api/public/generations/${generationId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${client.publicKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        output: options.output,
        usage: options.usage,
        metadata: options.metadata,
        endTime: new Date().toISOString(),
      }),
    }).catch(err => {
      console.error('Failed to update generation in Langfuse:', err);
      return null;
    });

    if (response && !response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`Langfuse generation update failed: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    console.error('Error updating Langfuse generation:', error);
  }
}

/**
 * Helper to trace OpenAI chat completion calls
 */
export async function traceOpenAIChatCompletion(
  traceId: string | null,
  options: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    response: any;
    userId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<string | null> {
  if (!traceId) return null;

  const usage = options.response?.usage || {};
  const output = options.response?.choices?.[0]?.message?.content || null;

  const generationId = await createGeneration(traceId, {
    name: 'openai-chat-completion',
    model: options.model,
    input: {
      messages: options.messages,
      model: options.model,
    },
    output,
    usage: {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
    },
    metadata: {
      ...options.metadata,
      userId: options.userId,
    },
  });

  return generationId;
}

/**
 * Helper to trace OpenAI embedding calls
 */
export async function traceOpenAIEmbedding(
  traceId: string | null,
  options: {
    model: string;
    input: string | string[];
    response: any;
    userId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<string | null> {
  if (!traceId) return null;

  const usage = options.response?.usage || {};
  const output = Array.isArray(options.input)
    ? { embeddings: options.response?.data?.map((d: any) => ({ dimensions: d.embedding?.length || 0 })) }
    : { dimensions: options.response?.data?.[0]?.embedding?.length || 0 };

  const spanId = await createSpan(traceId, {
    name: 'openai-embedding',
    input: {
      model: options.model,
      input: Array.isArray(options.input) 
        ? `${options.input.length} texts` 
        : options.input.substring(0, 200),
    },
    output,
    metadata: {
      ...options.metadata,
      userId: options.userId,
      inputCount: Array.isArray(options.input) ? options.input.length : 1,
      usage: {
        promptTokens: usage.prompt_tokens,
        totalTokens: usage.total_tokens,
      },
    },
  });

  return spanId;
}

/**
 * Helper to trace OpenAI audio transcription calls
 */
export async function traceOpenAIAudioTranscription(
  traceId: string | null,
  options: {
    model: string;
    response: any;
    userId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<string | null> {
  if (!traceId) return null;

  const spanId = await createSpan(traceId, {
    name: 'openai-audio-transcription',
    input: {
      model: options.model,
    },
    output: {
      text: options.response?.text || null,
      duration: options.response?.duration || null,
    },
    metadata: {
      ...options.metadata,
      userId: options.userId,
    },
  });

  return spanId;
}
