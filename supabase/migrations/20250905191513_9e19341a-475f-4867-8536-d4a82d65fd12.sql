-- Fix security warnings by setting search_path for functions
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
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
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

-- Fix security warnings by setting search_path for functions
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
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
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