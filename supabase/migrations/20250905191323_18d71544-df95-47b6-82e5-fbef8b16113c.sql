-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to documents table for vector search
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create index for vector similarity search
CREATE INDEX IF NOT EXISTS documents_embedding_idx 
ON public.documents USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Add embedding column to contracts table for vector search  
ALTER TABLE public.contracts
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create index for contract vector similarity search
CREATE INDEX IF NOT EXISTS contracts_embedding_idx
ON public.contracts USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Function to search documents by similarity
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  name text,
  content text,
  summary text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    documents.id,
    documents.name,
    documents.content,
    documents.summary,
    1 - (documents.embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE documents.embedding IS NOT NULL
    AND 1 - (documents.embedding <=> query_embedding) > match_threshold
    AND documents.organization_id = get_current_user_organization_id()
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- Function to search contracts by similarity
CREATE OR REPLACE FUNCTION match_contracts(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  title text,
  description text,
  terms text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    contracts.id,
    contracts.title,
    contracts.description,
    contracts.terms,
    1 - (contracts.embedding <=> query_embedding) AS similarity
  FROM contracts
  WHERE contracts.embedding IS NOT NULL
    AND 1 - (contracts.embedding <=> query_embedding) > match_threshold
    AND contracts.organization_id = get_current_user_organization_id()
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- Create table for voice transcriptions
CREATE TABLE IF NOT EXISTS public.voice_transcriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  created_by uuid NOT NULL,
  case_id uuid,
  title text NOT NULL,
  transcript text NOT NULL,
  summary text,
  audio_file_path text,
  duration_seconds integer,
  status text DEFAULT 'completed' CHECK (status IN ('processing', 'completed', 'failed')),
  metadata jsonb DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS for voice transcriptions
ALTER TABLE public.voice_transcriptions ENABLE ROW LEVEL SECURITY;

-- RLS policies for voice transcriptions
CREATE POLICY "Users can view transcriptions in their organization" 
ON public.voice_transcriptions 
FOR SELECT 
USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can create transcriptions in their organization" 
ON public.voice_transcriptions 
FOR INSERT 
WITH CHECK (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can update transcriptions in their organization" 
ON public.voice_transcriptions 
FOR UPDATE 
USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can delete transcriptions in their organization" 
ON public.voice_transcriptions 
FOR DELETE 
USING (organization_id = get_current_user_organization_id());

-- Add trigger for updated_at
CREATE TRIGGER update_voice_transcriptions_updated_at
BEFORE UPDATE ON public.voice_transcriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();