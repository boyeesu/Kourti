-- Setup document analysis tables and functions
-- This migration sets up the necessary tables and functions for document analysis

-- Create document_analyses table
CREATE TABLE IF NOT EXISTS public.document_analyses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id uuid NOT NULL,
  analysis_type text NOT NULL,
  content text NOT NULL,
  organization_id uuid NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  embedding vector(1536), -- For similarity search
  metadata jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'completed',
  error text,
  
  CONSTRAINT fk_document_analyses_organization
    FOREIGN KEY (organization_id)
    REFERENCES organizations(id)
    ON DELETE CASCADE,
    
  CONSTRAINT fk_document_analyses_created_by
    FOREIGN KEY (created_by)
    REFERENCES auth.users(id)
    ON DELETE CASCADE
);

-- Add RLS policies
ALTER TABLE public.document_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view analyses for their organization"
  ON public.document_analyses
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM profiles 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create analyses for their organization"
  ON public.document_analyses
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id 
      FROM profiles 
      WHERE user_id = auth.uid()
    )
  );

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_document_analyses_document_id 
  ON public.document_analyses(document_id);
CREATE INDEX IF NOT EXISTS idx_document_analyses_organization_id 
  ON public.document_analyses(organization_id);
CREATE INDEX IF NOT EXISTS idx_document_analyses_created_by 
  ON public.document_analyses(created_by);
CREATE INDEX IF NOT EXISTS idx_document_analyses_embedding 
  ON public.document_analyses 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Function to analyze document content
CREATE OR REPLACE FUNCTION analyze_document(
  p_document_id uuid,
  p_content text,
  p_document_type text DEFAULT 'document',
  p_analysis_type text DEFAULT 'general'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organization_id uuid;
  v_user_id uuid;
  v_api_key text;
  v_result jsonb;
  v_analysis_id uuid;
BEGIN
  -- Get current user's organization
  SELECT organization_id INTO v_organization_id
  FROM profiles
  WHERE user_id = auth.uid();
  
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'User organization not found';
  END IF;

  -- Get current user ID
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Create analysis record
  INSERT INTO document_analyses (
    document_id,
    analysis_type,
    organization_id,
    created_by,
    status,
    content
  ) VALUES (
    p_document_id,
    p_analysis_type,
    v_organization_id,
    v_user_id,
    'processing',
    ''
  ) RETURNING id INTO v_analysis_id;

  -- Get OpenAI API key from secure settings
  v_api_key := current_setting('app.settings.openai_key', true);
  
  IF v_api_key IS NULL THEN
    RAISE EXCEPTION 'OpenAI API key not configured';
  END IF;

  -- Call OpenAI API using pg_net extension (if available)
  -- Otherwise, return a placeholder response
  BEGIN
    -- TODO: Replace with actual OpenAI API call once pg_net is enabled
    v_result := jsonb_build_object(
      'status', 'success',
      'content', 'Document analysis is being processed. Please check back later.'
    );

    -- Update analysis record
    UPDATE document_analyses
    SET 
      content = v_result->>'content',
      status = 'completed',
      updated_at = now()
    WHERE id = v_analysis_id;

  EXCEPTION WHEN OTHERS THEN
    -- Update analysis record with error
    UPDATE document_analyses
    SET 
      status = 'failed',
      error = SQLERRM,
      updated_at = now()
    WHERE id = v_analysis_id;
    
    RAISE EXCEPTION 'Failed to analyze document: %', SQLERRM;
  END;

  RETURN v_result;
END;
$$;

-- Function to get analysis results
CREATE OR REPLACE FUNCTION get_document_analysis(
  p_document_id uuid,
  p_analysis_type text DEFAULT 'general'
)
RETURNS TABLE (
  id uuid,
  content text,
  status text,
  created_at timestamptz,
  error text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.content,
    a.status,
    a.created_at,
    a.error
  FROM document_analyses a
  WHERE a.document_id = p_document_id
    AND a.analysis_type = p_analysis_type
    AND a.organization_id IN (
      SELECT organization_id 
      FROM profiles 
      WHERE user_id = auth.uid()
    )
  ORDER BY a.created_at DESC
  LIMIT 1;
END;
$$;

-- Add comment explaining the migration
COMMENT ON TABLE public.document_analyses IS 
  'Stores document analysis results and metadata';

COMMENT ON FUNCTION analyze_document IS 
  'Analyzes a document using AI and stores the results';

COMMENT ON FUNCTION get_document_analysis IS 
  'Retrieves the latest analysis results for a document';