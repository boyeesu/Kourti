-- Fix vector search functions to use proper distance operators
-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop and recreate match_documents function with correct operators
DROP FUNCTION IF EXISTS match_documents(vector, double precision, int);

CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_threshold double precision DEFAULT 0.3,
  match_count int DEFAULT 10
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
  ORDER BY (documents.embedding <-> query_embedding) ASC
  LIMIT match_count;
$$;

-- Drop and recreate match_contracts function with correct operators
DROP FUNCTION IF EXISTS match_contracts(vector, double precision, int);

CREATE OR REPLACE FUNCTION match_contracts(
  query_embedding vector(1536),
  match_threshold double precision DEFAULT 0.3,
  match_count int DEFAULT 10
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
    contracts.content,
    contracts.created_at,
    contracts.updated_at,
    1 - (contracts.embedding <-> query_embedding) AS similarity
  FROM contracts
  WHERE contracts.embedding IS NOT NULL
    AND (contracts.embedding <-> query_embedding) < (1 - match_threshold)
  ORDER BY (contracts.embedding <-> query_embedding) ASC
  LIMIT match_count;
$$;