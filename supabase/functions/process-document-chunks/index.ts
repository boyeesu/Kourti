declare const Deno: any;

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { HttpError, createErrorResponse } from "../_shared/httpError.ts";
import { createEmptyResponse, createJsonResponse, CorsSecurityHeadersOptions } from "../_shared/responseHeaders.ts";
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMIT_PRESETS, createRateLimitHeaders } from "../_shared/rateLimiting.ts";
import { createErrorResponse as createSanitizedErrorResponse } from "../_shared/errorHandling.ts";
import { requireCsrfTokenForUser } from "../_shared/csrfProtection.ts";
import { createTrace, traceOpenAIEmbedding } from "../_shared/langfuse.ts";

const ALLOWED_ORIGINS = [
  Deno.env.get("APP_URL"),
  ...(Deno.env.get("ENVIRONMENT") !== "production" ? [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8080",
    "http://localhost:8081",
    "http://localhost:8082",
    "http://localhost:8083",
  ] : []),
  "https://app.kourti.com",
  "https://kouti-legal-hub-41.lovable.app",
]
  .flatMap((value) => (value ? value.split(",") : []))
  .filter(Boolean)
  .map((origin) => {
    if (origin && !origin.startsWith('http://') && !origin.startsWith('https://')) {
      return `https://${origin}`;
    }
    return origin;
  })
  .filter((origin) => origin && (origin.startsWith('http://') || origin.startsWith('https://')));

function getCorsOptions(requestOrigin: string | null): CorsSecurityHeadersOptions {
  const origin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
    ? requestOrigin
    : (ALLOWED_ORIGINS[0] || "https://app.kourti.com");

  return {
    origin,
    requestOrigin,
    allowedOrigins: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : undefined,
    allowCredentials: true,
    allowMethods: ["POST", "OPTIONS"],
  };
}

type DocumentChunkInsert = {
  document_id?: string | null;
  contract_id?: string | null;
  organization_id: string;
  chunk_index: number;
  content: string;
  token_count?: number | null;
  embedding: number[];
  metadata?: Record<string, unknown>;
};

// Document chunking logic (simplified version)
function chunkText(text: string, maxTokens: number = 500): Array<{ content: string, tokenCount: number }> {
  if (!text || text.length < 50) return [];

  const sentences = text.match(/[^\.!?]+[\.!?]+/g) || [text];
  const chunks: Array<{ content: string, tokenCount: number }> = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    const tentativeChunk = currentChunk + (currentChunk ? ' ' : '') + sentence.trim();
    const tentativeTokens = Math.ceil(tentativeChunk.length / 4); // Rough token estimate

    if (tentativeTokens > maxTokens && currentChunk) {
      chunks.push({
        content: currentChunk.trim(),
        tokenCount: Math.ceil(currentChunk.length / 4)
      });
      currentChunk = sentence.trim();
    } else {
      currentChunk = tentativeChunk;
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      tokenCount: Math.ceil(currentChunk.length / 4)
    });
  }

  return chunks.filter(chunk => chunk.content.length > 20);
}

export const processDocumentChunksHandler = async (req: Request) => {
  const requestOrigin = req.headers.get("Origin");
  const corsOptions = getCorsOptions(requestOrigin);

  if (req.method === 'OPTIONS') {
    return createEmptyResponse({ status: 204, cors: corsOptions });
  }

  // Rate limiting - prevent AI cost abuse
  const rateLimitId = getRateLimitIdentifier(req);
  const rateLimitResult = checkRateLimit({
    ...RATE_LIMIT_PRESETS.AI,
    identifier: rateLimitId,
  });

  if (!rateLimitResult.allowed) {
    const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
    return createJsonResponse(
      {
        success: false,
        error: 'Too many requests. Please try again later.',
        errorCode: 'RATE_LIMIT_EXCEEDED',
      },
      {
        status: 429,
        cors: corsOptions,
        headers: rateLimitHeaders,
      }
    );
  }

  try {
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      throw new HttpError('Missing Authorization header', 401, 'UNAUTHORIZED');
    }

    const accessToken = authHeader.replace('Bearer ', '').trim();

    if (!accessToken) {
      throw new HttpError('Invalid Authorization header', 401, 'UNAUTHORIZED');
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!OPENAI_API_KEY) {
      throw new HttpError('OPENAI_API_KEY not configured', 503, 'OPENAI_CONFIG_MISSING');
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new HttpError('Supabase configuration missing', 500, 'SUPABASE_CONFIG_MISSING');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);

    if (userError || !userData?.user) {
      console.error('Error resolving user from token:', userError);
      throw new HttpError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const user = userData.user;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (profileError) {
      console.error('Error fetching user organization:', profileError);
      const status = profileError.code === 'PGRST116' ? 404 : 500;
      throw new HttpError(
        profileError.code === 'PGRST116'
          ? 'User organization not found'
          : 'Failed to load user organization',
        status,
        profileError.code === 'PGRST116'
          ? 'USER_ORGANIZATION_NOT_FOUND'
          : 'USER_ORGANIZATION_LOAD_FAILED',
        { supabaseCode: profileError.code },
      );
    }

    const organizationId = (profile as { organization_id: string | null })?.organization_id;

    if (!organizationId) {
      throw new HttpError('User does not belong to an organization', 403, 'FORBIDDEN');
    }

    // CSRF Protection - Re-enabled after fixing token refresh in csrfClient.ts
    // The client now proactively refreshes tokens before they expire
    await requireCsrfTokenForUser(supabase, user.id, req);

    let payload: any;

    try {
      payload = await req.json();
    } catch {
      throw new HttpError('Invalid JSON payload', 400, 'INVALID_JSON');
    }

    const { documentId, contractId, content, documentType } = payload ?? {};

    // Create Langfuse trace for this request (after payload is parsed)
    const traceId = await createTrace({
      name: 'process-document-chunks',
      userId: user.id,
      metadata: {
        documentId,
        contractId,
        documentType,
        organizationId,
      },
      tags: ['document-processing', 'embeddings'],
    });

    if (!content) {
      throw new HttpError('Content is required', 400, 'INVALID_INPUT');
    }

    // Input size limit to prevent cost abuse
    if (typeof content === 'string' && content.length > 500000) {
      throw new HttpError('Content exceeds maximum length of 500,000 characters', 400, 'INPUT_TOO_LARGE');
    }

    if (!documentId && !contractId) {
      throw new HttpError('Document or contract ID is required', 400, 'INVALID_INPUT');
    }

    if (documentId) {
      const { data: document, error: documentError } = await supabase
        .from('documents' as any)
        .select('organization_id')
        .eq('id', documentId)
        .single() as { data: { organization_id: string } | null; error: any };

      if (documentError) {
        console.error('Error verifying document ownership:', documentError);
        const status = documentError.code === 'PGRST116' ? 404 : 500;
        throw new HttpError(
          documentError.code === 'PGRST116'
            ? 'Document not found'
            : 'Failed to verify document ownership',
          status,
          documentError.code === 'PGRST116'
            ? 'DOCUMENT_NOT_FOUND'
            : 'DOCUMENT_OWNERSHIP_ERROR',
          { supabaseCode: documentError.code },
        );
      }

      if (document?.organization_id !== organizationId) {
        throw new HttpError('Unauthorized to process this document', 403, 'FORBIDDEN');
      }
    }

    if (contractId) {
      const { data: contract, error: contractError } = await supabase
        .from('contracts' as any)
        .select('organization_id')
        .eq('id', contractId)
        .single() as { data: { organization_id: string } | null; error: any };

      if (contractError) {
        console.error('Error verifying contract ownership:', contractError);
        const status = contractError.code === 'PGRST116' ? 404 : 500;
        throw new HttpError(
          contractError.code === 'PGRST116'
            ? 'Contract not found'
            : 'Failed to verify contract ownership',
          status,
          contractError.code === 'PGRST116'
            ? 'CONTRACT_NOT_FOUND'
            : 'CONTRACT_OWNERSHIP_ERROR',
          { supabaseCode: contractError.code },
        );
      }

      if (contract?.organization_id !== organizationId) {
        throw new HttpError('Unauthorized to process this contract', 403, 'FORBIDDEN');
      }
    }

    console.log(`Processing ${documentType || 'document'} for chunking and embedding`);

    // Step 1: Clear existing chunks
    const matchCriteria: Record<string, string> = { organization_id: organizationId };
    if (documentId) {
      matchCriteria.document_id = documentId;
    }
    if (contractId) {
      matchCriteria.contract_id = contractId;
    }

    const clearResult = await supabase
      .from('document_chunks' as any)
      .delete()
      .match(matchCriteria);

    if (clearResult.error) {
      console.error('Error clearing existing chunks:', clearResult.error);
      throw new HttpError(
        `Failed to clear existing chunks: ${clearResult.error.message}`,
        500,
        'DATABASE_ERROR',
        { supabaseCode: clearResult.error.code },
      );
    }

    // Step 2: Chunk the document
    const chunkSize = documentType === 'contract' ? 800 : 600;
    const chunks = chunkText(content, chunkSize);

    console.log(`Created ${chunks.length} chunks`);

    if (chunks.length === 0) {
      return createJsonResponse(
        {
          success: true,
          chunksProcessed: 0,
          message: 'Document too short for chunking',
        },
        { cors: corsOptions },
      );
    }

    // Step 3: Generate embeddings in batches and store chunks
    const processedChunks: Array<{ index: number; tokenCount: number; contentLength: number }> = [];
    const embeddingBatchSize = 20; // OpenAI allows batching up to 2048 inputs
    const maxRetries = 3;

    // Helper function to retry failed requests
    const fetchWithRetry = async (url: string, options: RequestInit, retries = maxRetries): Promise<Response> => {
      try {
        const response = await fetch(url, options);
        if (!response.ok && response.status >= 500 && retries > 0) {
          console.log(`Retrying request, attempts remaining: ${retries}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (maxRetries - retries + 1)));
          return fetchWithRetry(url, options, retries - 1);
        }
        return response;
      } catch (error) {
        if (retries > 0) {
          console.log(`Network error, retrying. Attempts remaining: ${retries}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (maxRetries - retries + 1)));
          return fetchWithRetry(url, options, retries - 1);
        }
        throw error;
      }
    };

    // Process chunks in batches for embedding generation
    for (let i = 0; i < chunks.length; i += embeddingBatchSize) {
      const batch = chunks.slice(i, Math.min(i + embeddingBatchSize, chunks.length));
      const batchStartTime = Date.now();

      try {
        // Generate embeddings for entire batch at once
        const embeddingResponse = await fetchWithRetry('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: batch.map(c => c.content),
            encoding_format: 'float'
          }),
        });

        if (!embeddingResponse.ok) {
          const errorData = await embeddingResponse.json();
          console.error('OpenAI embedding batch error:', errorData);
          throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
        }

        const embeddingData = await embeddingResponse.json();
        const embeddings: number[][] = embeddingData.data.map((d: any) => d.embedding);

        // Trace the embedding generation
        await traceOpenAIEmbedding(traceId, {
          model: 'text-embedding-3-small',
          input: batch.map(c => c.content),
          response: embeddingData,
          userId: user.id,
          metadata: {
            batchIndex: Math.floor(i / embeddingBatchSize),
            batchSize: batch.length,
            documentId,
            contractId,
            documentType,
          },
        });

        console.log(`Generated ${embeddings.length} embeddings in ${Date.now() - batchStartTime}ms`);

        // Prepare batch insert data
        const chunksToInsert: DocumentChunkInsert[] = batch.map((chunk, batchIndex) => {
          const chunkData: DocumentChunkInsert = {
            organization_id: organizationId,
            chunk_index: i + batchIndex,
            content: chunk.content,
            token_count: chunk.tokenCount,
            embedding: embeddings[batchIndex],
            metadata: {
              chunkSize,
              documentType: documentType || 'document',
              processingDate: new Date().toISOString(),
              embeddingModel: 'text-embedding-3-small'
            }
          };

          if (documentId) {
            chunkData.document_id = documentId;
          } else {
            chunkData.contract_id = contractId;
          }

          return chunkData;
        });

        // Batch insert into database
        const insertStartTime = Date.now();
        const insertResult = await supabase
          .from('document_chunks' as any)
          .insert(chunksToInsert as any);

        if (insertResult.error) {
          console.error('Database batch insert error:', insertResult.error);
          throw new HttpError(
            `Database error: ${insertResult.error.message}`,
            500,
            'DATABASE_ERROR',
            { supabaseCode: insertResult.error.code },
          );
        }

        console.log(`Inserted ${chunksToInsert.length} chunks in ${Date.now() - insertStartTime}ms`);

        // Track processed chunks
        batch.forEach((chunk, batchIndex) => {
          processedChunks.push({
            index: i + batchIndex,
            tokenCount: chunk.tokenCount,
            contentLength: chunk.content.length
          });
        });

      } catch (error) {
        console.error(`Error processing batch starting at chunk ${i}:`, error);
        // Log detailed error but continue processing remaining batches
        console.error('Batch error details:', {
          batchStart: i,
          batchSize: batch.length,
          error: error instanceof Error ? error.message : String(error)
        });
      }

      // Rate limiting: small delay between batches
      if (i + embeddingBatchSize < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log(`Successfully processed ${processedChunks.length} chunks`);

    const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
    return createJsonResponse(
      {
        success: true,
        chunksProcessed: processedChunks.length,
        totalChunks: chunks.length,
        chunks: processedChunks,
        documentId: documentId || contractId,
        documentType,
      },
      {
        cors: corsOptions,
        headers: rateLimitHeaders,
      }
    );
  } catch (error: unknown) {
    if (error instanceof HttpError) {
      return createErrorResponse(error, corsOptions);
    }
    return createSanitizedErrorResponse(error, corsOptions, {
      function: 'process-document-chunks',
    });
  }
};

// @ts-ignore - Deno-specific property
if (import.meta.main) {
  serve(processDocumentChunksHandler);
}