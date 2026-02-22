# Langfuse Tracing Setup

Langfuse has been integrated into all AI services in the application for comprehensive observability and tracing.

## Environment Variables Required

The following environment variables must be set in your `.env` file (or Supabase secrets):

- `LANGFUSE_PUBLIC_KEY` - Your Langfuse public key
- `LANGFUSE_SECRET_KEY` - Your Langfuse secret key  
- `LANGFUSE_HOST` - (Optional) Langfuse host URL, defaults to `https://cloud.langfuse.com` if not set

## What's Being Traced

### 1. **ream-ai-assistant** (`supabase/functions/ream-ai-assistant/`)
- ✅ OpenAI Chat Completions (GPT-5.1)
- ✅ OpenAI Embeddings (text-embedding-3-small) for vector search queries
- Metadata: userId, organizationId, conversation history, document context

### 2. **advanced-contract-analysis** (`supabase/functions/advanced-contract-analysis/`)
- ✅ OpenAI Chat Completions (with model fallback)
- Metadata: analysisType, documentId, RAG context, streaming mode

### 3. **voice-transcription** (`supabase/functions/voice-transcription/`)
- ✅ OpenAI Audio Transcription (Whisper-1)
- ✅ OpenAI Chat Completions for transcript summarization
- Metadata: action type, userId

### 4. **process-document-chunks** (`supabase/functions/process-document-chunks/`)
- ✅ OpenAI Embeddings (text-embedding-3-small) - batch processing
- Metadata: documentId, contractId, documentType, batch information

### 5. **generate-embeddings** (`supabase/functions/generate-embeddings/`)
- ✅ OpenAI Embeddings (text-embedding-3-small)
- Metadata: documentId, documentType

### 6. **compare-contracts** (`supabase/functions/compare-contracts/`)
- ✅ OpenAI Chat Completions (GPT-4o)
- Metadata: document lengths, comparison parameters

### 7. **contract-analysis-ai** (`supabase/functions/contract-analysis-ai/`)
- ✅ OpenAI Chat Completions (GPT-4o)
- Metadata: analysisType, goal, text length

### 8. **ai-contract-generator** (`supabase/functions/ai-contract-generator/`)
- ✅ OpenAI Chat Completions (GPT-4.1)
- Metadata: contractType, jurisdiction, parties, terms, clauses

## Implementation Details

### Shared Langfuse Client
Located at: `supabase/functions/_shared/langfuse.ts`

This utility provides:
- `createTrace()` - Creates a new trace for a request
- `traceOpenAIChatCompletion()` - Traces OpenAI chat completion calls
- `traceOpenAIEmbedding()` - Traces OpenAI embedding calls
- `traceOpenAIAudioTranscription()` - Traces OpenAI audio transcription calls

### Features
- **Non-blocking**: All Langfuse API calls are fire-and-forget, so failures won't affect your application
- **Comprehensive metadata**: Each trace includes relevant context (user IDs, document IDs, model parameters, etc.)
- **Token tracking**: Automatically captures token usage from OpenAI responses
- **Error handling**: Gracefully handles missing credentials or API failures

## Viewing Traces

1. Log into your Langfuse dashboard
2. Navigate to the Traces section
3. Filter by:
   - User ID
   - Function name (tags)
   - Date range
   - Model used

## Benefits

- **Cost tracking**: Monitor token usage and costs across all AI services
- **Performance monitoring**: Track latency and identify bottlenecks
- **Debugging**: Inspect exact inputs/outputs for each AI call
- **Quality assurance**: Review AI responses and identify issues
- **Usage analytics**: Understand which features are used most

## Notes

- Tracing is completely optional - if Langfuse credentials are not configured, the application will continue to work normally (with a warning in logs)
- All tracing is asynchronous and non-blocking
- Sensitive data in traces can be masked using Langfuse's masking features in the dashboard
