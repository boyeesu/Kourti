import { HttpError, createErrorResponse } from "../_shared/httpError.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";

export const generateEmbeddingsHandler = async (req: Request) => {
  const { headers: corsHeaders, isAllowed } = buildCorsHeaders(req.headers.get('origin'));

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    if (!isAllowed) {
      return new Response('Origin not allowed', { status: 403, headers: corsHeaders });
    }
    return new Response(null, { headers: corsHeaders });
  }

  if (!isAllowed) {
    return new Response('Origin not allowed', { status: 403, headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

    if (!OPENAI_API_KEY) {
      throw new HttpError('OPENAI_API_KEY not configured', 503, 'OPENAI_CONFIG_MISSING');
    }

    let payload: any;

    try {
      payload = await req.json();
    } catch {
      throw new HttpError('Invalid JSON payload', 400, 'INVALID_JSON');
    }

    const { documentId, documentType, content } = payload ?? {};

    if (!documentId || !content || !documentType) {
      throw new HttpError('Missing required parameters: documentId, documentType, content', 400, 'INVALID_INPUT');
    }

    console.log(`Generating embedding for ${documentType} ${documentId}`);

    // Generate embedding using OpenAI
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: content.substring(0, 8000), // Limit content length
        encoding_format: 'float'
      }),
    });

    if (!response.ok) {
      let message = 'Unknown error';
      try {
        const errorData = await response.json();
        console.error('OpenAI embedding error:', errorData);
        message = errorData.error?.message || JSON.stringify(errorData);
      } catch {
        const errorText = await response.text();
        console.error('OpenAI embedding error:', errorText);
        message = errorText;
      }

      throw new HttpError(`OpenAI API error: ${message}`, 502, 'OPENAI_UPSTREAM_ERROR', {
        status: response.status,
      });
    }

    const embeddingData = await response.json();
    const embedding = embeddingData.data[0].embedding;

    console.log(`Generated embedding with ${embedding.length} dimensions`);

    return new Response(JSON.stringify({
      success: true,
      documentId,
      documentType,
      embedding,
      embeddingLength: embedding.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in generate-embeddings function:', error);
    return createErrorResponse(error, corsHeaders, 'Failed to generate embeddings');
  }
};

// @ts-ignore - Deno-specific property
if (import.meta.main) {
  Deno.serve(generateEmbeddingsHandler);
}