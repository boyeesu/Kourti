-- Create a version of match_document_chunks that accepts organization_id explicitly.
-- This is needed for edge functions that use the service role key (bypassing RLS)
-- and therefore cannot rely on get_current_user_organization_id().

CREATE OR REPLACE FUNCTION match_document_chunks_for_org(
  query_embedding vector(1536),
  org_id uuid,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  contract_id uuid,
  content text,
  chunk_index int,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.contract_id,
    dc.content,
    dc.chunk_index,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  WHERE dc.embedding IS NOT NULL
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
    AND dc.organization_id = org_id
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute to service_role (used by edge functions) and authenticated users
GRANT EXECUTE ON FUNCTION match_document_chunks_for_org(vector(1536), uuid, float, int) TO service_role;
GRANT EXECUTE ON FUNCTION match_document_chunks_for_org(vector(1536), uuid, float, int) TO authenticated;
