import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
function chunkText(text: string, maxTokens: number = 500): Array<{content: string, tokenCount: number}> {
  if (!text || text.length < 50) return [];
  
  const sentences = text.match(/[^\.!?]+[\.!?]+/g) || [text];
  const chunks: Array<{content: string, tokenCount: number}> = [];
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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = authHeader.replace('Bearer ', '').trim();

    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'Invalid Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase configuration missing');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);

    if (userError || !userData?.user) {
      console.error('Error resolving user from token:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
      return new Response(
        JSON.stringify({
          error:
            profileError.code === 'PGRST116'
              ? 'User organization not found'
              : 'Failed to load user organization',
        }),
        {
          status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const organizationId = (profile as { organization_id: string | null })?.organization_id;

    if (!organizationId) {
      return new Response(JSON.stringify({ error: 'User does not belong to an organization' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { documentId, contractId, content, documentType } = await req.json();

    if (!content) {
      throw new Error('Content is required');
    }

    if (!documentId && !contractId) {
      return new Response(JSON.stringify({ error: 'Document or contract ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (documentId) {
      const { data: document, error: documentError } = await supabase
        .from('documents')
        .select('organization_id')
        .eq('id', documentId)
        .single();

      if (documentError) {
        console.error('Error verifying document ownership:', documentError);
        const status = documentError.code === 'PGRST116' ? 404 : 500;
        return new Response(
          JSON.stringify({
            error:
              documentError.code === 'PGRST116'
                ? 'Document not found'
                : 'Failed to verify document ownership',
          }),
          {
            status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      if (document?.organization_id !== organizationId) {
        return new Response(JSON.stringify({ error: 'Unauthorized to process this document' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (contractId) {
      const { data: contract, error: contractError } = await supabase
        .from('contracts')
        .select('organization_id')
        .eq('id', contractId)
        .single();

      if (contractError) {
        console.error('Error verifying contract ownership:', contractError);
        const status = contractError.code === 'PGRST116' ? 404 : 500;
        return new Response(
          JSON.stringify({
            error:
              contractError.code === 'PGRST116'
                ? 'Contract not found'
                : 'Failed to verify contract ownership',
          }),
          {
            status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      if (contract?.organization_id !== organizationId) {
        return new Response(JSON.stringify({ error: 'Unauthorized to process this contract' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
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
      .from('document_chunks')
      .delete()
      .match(matchCriteria);

    if (clearResult.error) {
      console.error('Error clearing existing chunks:', clearResult.error);
      throw new Error(`Failed to clear existing chunks: ${clearResult.error.message}`);
    }

    // Step 2: Chunk the document
    const chunkSize = documentType === 'contract' ? 800 : 600;
    const chunks = chunkText(content, chunkSize);

    console.log(`Created ${chunks.length} chunks`);

    if (chunks.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        chunksProcessed: 0,
        message: 'Document too short for chunking'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 3: Generate embeddings and store chunks
    const processedChunks = [];
    const batchSize = 5; // Process in smaller batches to avoid rate limits

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      for (const [batchIndex, chunk] of batch.entries()) {
        try {
          // Generate embedding for this chunk
          const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'text-embedding-3-small',
              input: chunk.content,
              encoding_format: 'float'
            }),
          });

          if (!embeddingResponse.ok) {
            const errorData = await embeddingResponse.json();
            console.error('OpenAI embedding error:', errorData);
            throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
          }

          const embeddingData = await embeddingResponse.json();
          const embedding: number[] = embeddingData.data[0].embedding;

          // Store chunk in database
          const chunkData: DocumentChunkInsert = {
            organization_id: organizationId,
            chunk_index: i + batchIndex,
            content: chunk.content,
            token_count: chunk.tokenCount,
            embedding,
            metadata: {
              chunkSize,
              documentType: documentType || 'document',
              processingDate: new Date().toISOString()
            }
          };

          if (documentId) {
            chunkData.document_id = documentId;
          } else {
            chunkData.contract_id = contractId;
          }

          const insertResult = await supabase
            .from('document_chunks')
            .insert(chunkData);

          if (insertResult.error) {
            console.error('Database insert error:', insertResult.error);
            throw new Error(`Database error: ${insertResult.error.message}`);
          }

          processedChunks.push({
            index: i + batchIndex,
            tokenCount: chunk.tokenCount,
            contentLength: chunk.content.length
          });

        } catch (error) {
          console.error(`Error processing chunk ${i + batchIndex}:`, error);
          // Continue with other chunks even if one fails
        }
      }

      // Small delay between batches to be respectful to OpenAI's rate limits
      if (i + batchSize < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`Successfully processed ${processedChunks.length} chunks`);

    return new Response(JSON.stringify({ 
      success: true,
      chunksProcessed: processedChunks.length,
      totalChunks: chunks.length,
      chunks: processedChunks,
      documentId: documentId || contractId,
      documentType
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in process-document-chunks function:', error);
    return new Response(JSON.stringify({ 
      error: error?.message || 'Failed to process document chunks'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});