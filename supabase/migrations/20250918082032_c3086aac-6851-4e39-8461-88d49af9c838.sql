-- Create document_chunks table for RAG implementation
CREATE TABLE IF NOT EXISTS public.document_chunks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id uuid REFERENCES public.documents(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  token_count integer,
  embedding vector(1536),
  metadata jsonb DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- Ensure either document_id or contract_id is set, but not both
  CONSTRAINT check_single_parent CHECK (
    (document_id IS NOT NULL AND contract_id IS NULL) OR
    (document_id IS NULL AND contract_id IS NOT NULL)
  )
);

-- Enable RLS
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view chunks in their organization" 
ON public.document_chunks 
FOR SELECT 
USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can create chunks in their organization" 
ON public.document_chunks 
FOR INSERT 
WITH CHECK (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can update chunks in their organization" 
ON public.document_chunks 
FOR UPDATE 
USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can delete chunks in their organization" 
ON public.document_chunks 
FOR DELETE 
USING (organization_id = get_current_user_organization_id());

-- Create indexes for better performance
CREATE INDEX idx_document_chunks_document_id ON public.document_chunks(document_id);
CREATE INDEX idx_document_chunks_contract_id ON public.document_chunks(contract_id);
CREATE INDEX idx_document_chunks_organization_id ON public.document_chunks(organization_id);

-- Create vector similarity search function for chunks
CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  contract_id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    document_chunks.id,
    document_chunks.document_id,
    document_chunks.contract_id,
    document_chunks.content,
    document_chunks.metadata,
    1 - (document_chunks.embedding <-> query_embedding) AS similarity
  FROM document_chunks
  WHERE document_chunks.embedding IS NOT NULL
    AND 1 - (document_chunks.embedding <-> query_embedding) > match_threshold
    AND document_chunks.organization_id = get_current_user_organization_id()
  ORDER BY document_chunks.embedding <-> query_embedding
  LIMIT match_count;
$$;

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_document_chunks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_document_chunks_updated_at
    BEFORE UPDATE ON public.document_chunks
    FOR EACH ROW
    EXECUTE FUNCTION public.update_document_chunks_updated_at();