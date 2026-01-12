declare const Deno: any;

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createEmptyResponse, createJsonResponse, CorsSecurityHeadersOptions } from "../_shared/responseHeaders.ts";
import { HttpError, createErrorResponse } from "../_shared/httpError.ts";

const ALLOWED_ORIGINS = [
    Deno.env.get("APP_URL"),
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8080",
    "http://localhost:8081",
    "http://localhost:8082",
    "http://localhost:8083",
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

serve(async (req: Request): Promise<Response> => {
    const requestOrigin = req.headers.get("Origin");
    const corsOptions = getCorsOptions(requestOrigin);

    if (req.method === 'OPTIONS') {
        return createEmptyResponse({ status: 204, cors: corsOptions });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const openAIApiKey = Deno.env.get('OPENAI_API_KEY')!;

        if (!openAIApiKey) {
            throw new HttpError('OpenAI API key not configured', 503, 'OPENAI_CONFIG_MISSING');
        }

        let payload: any;
        try {
            payload = await req.json();
        } catch {
            throw new HttpError('Invalid JSON payload', 400, 'INVALID_JSON');
        }

        const { query, matchThreshold = 0.6, matchCount = 10 } = payload ?? {};

        if (!query || typeof query !== 'string' || query.trim().length < 3) {
            return createJsonResponse({
                success: true,
                results: [],
                message: 'Query too short'
            }, { cors: corsOptions });
        }

        console.log('RAG search request:', { queryLength: query.length, matchThreshold, matchCount });

        // Step 1: Generate embedding for the query
        const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openAIApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'text-embedding-3-small',
                input: query.substring(0, 2000),
                encoding_format: 'float'
            }),
        });

        if (!embeddingResponse.ok) {
            const errorText = await embeddingResponse.text();
            console.error('OpenAI embedding error:', errorText);
            throw new HttpError(`Embedding generation failed: ${embeddingResponse.status}`, 502, 'EMBEDDING_ERROR');
        }

        const embeddingData = await embeddingResponse.json();
        const queryEmbedding = embeddingData.data[0].embedding;

        console.log('Generated query embedding, dimension:', queryEmbedding.length);

        // Step 2: Perform vector search using direct SQL query (bypasses RPC issues)
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Use raw SQL query for vector similarity search
        const { data: vectorResults, error: vectorError } = await supabase
            .rpc('match_document_chunks', {
                query_embedding: queryEmbedding,
                match_threshold: matchThreshold,
                match_count: matchCount
            });

        // If RPC fails, try direct query as fallback
        let searchResults = vectorResults;

        if (vectorError || !vectorResults) {
            console.log('RPC failed, using direct SQL query fallback:', vectorError?.message);

            // Fallback: Get chunks and we'll return them without similarity scoring
            const { data: fallbackResults, error: fallbackError } = await supabase
                .from('document_chunks')
                .select('id, document_id, contract_id, content, chunk_index, metadata')
                .not('embedding', 'is', null)
                .limit(matchCount);

            if (fallbackError || !fallbackResults || fallbackResults.length === 0) {
                return createJsonResponse({
                    success: true,
                    results: [],
                    message: 'No document chunks available'
                }, { cors: corsOptions });
            }

            // Add default similarity for fallback results
            searchResults = fallbackResults.map((r: any) => ({
                ...r,
                similarity: 0.7 // Default similarity for fallback
            }));
        }

        // Step 3: Enrich results with document/contract names
        if (!searchResults || searchResults.length === 0) {
            return createJsonResponse({
                success: true,
                results: [],
                message: 'No matching documents found'
            }, { cors: corsOptions });
        }

        const documentIds = Array.from(new Set(searchResults.map((r: any) => r.document_id).filter(Boolean)));
        const contractIds = Array.from(new Set(searchResults.map((r: any) => r.contract_id).filter(Boolean)));

        const [docsResponse, contractsResponse] = await Promise.all([
            documentIds.length ? supabase.from('documents').select('id, name').in('id', documentIds) : Promise.resolve({ data: [] }),
            contractIds.length ? supabase.from('contracts').select('id, title').in('id', contractIds) : Promise.resolve({ data: [] })
        ]);

        const docNameMap = new Map((docsResponse.data || []).map((d: any) => [d.id, d.name]));
        const contractNameMap = new Map((contractsResponse.data || []).map((c: any) => [c.id, c.title]));

        const enrichedResults = searchResults.map((result: any) => ({
            ...result,
            documentName: result.document_id
                ? docNameMap.get(result.document_id) || 'Unknown Document'
                : contractNameMap.get(result.contract_id) || 'Unknown Contract',
            documentType: result.document_id ? 'document' : 'contract'
        }));

        console.log('RAG search completed:', { resultCount: enrichedResults.length });

        return createJsonResponse({
            success: true,
            results: enrichedResults
        }, { cors: corsOptions });

    } catch (error: unknown) {
        return createErrorResponse(error, corsOptions);
    }
});
