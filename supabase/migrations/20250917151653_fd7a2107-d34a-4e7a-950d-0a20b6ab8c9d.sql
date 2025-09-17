-- Fix vector search functions with correct types and operators
-- Drop existing functions that use incorrect operators
DROP FUNCTION IF EXISTS match_documents(extensions.vector, double precision, integer);
DROP FUNCTION IF EXISTS match_contracts(extensions.vector, double precision, integer);

-- Recreate match_documents function with proper vector type and L2 distance operator
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_threshold double precision DEFAULT 0.3,
  match_count integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  name text,
  content text,
  summary text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  similarity double precision
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    documents.id,
    documents.name,
    documents.content,
    documents.summary,
    documents.created_at,
    documents.updated_at,
    1 - (documents.embedding <-> query_embedding) AS similarity
  FROM documents
  WHERE documents.embedding IS NOT NULL
    AND (documents.embedding <-> query_embedding) < (1 - match_threshold)
    AND documents.organization_id = get_current_user_organization_id()
  ORDER BY (documents.embedding <-> query_embedding) ASC
  LIMIT match_count;
$$;

-- Recreate match_contracts function with proper vector type and L2 distance operator  
CREATE OR REPLACE FUNCTION match_contracts(
  query_embedding vector(1536),
  match_threshold double precision DEFAULT 0.3,
  match_count integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  terms text,
  content text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  similarity double precision
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    contracts.id,
    contracts.title,
    contracts.description,
    contracts.terms,
    COALESCE(contracts.terms, contracts.description) as content,
    contracts.created_at,
    contracts.updated_at,
    1 - (contracts.embedding <-> query_embedding) AS similarity
  FROM contracts
  WHERE contracts.embedding IS NOT NULL
    AND (contracts.embedding <-> query_embedding) < (1 - match_threshold)
    AND contracts.organization_id = get_current_user_organization_id()
  ORDER BY (contracts.embedding <-> query_embedding) ASC
  LIMIT match_count;
$$;