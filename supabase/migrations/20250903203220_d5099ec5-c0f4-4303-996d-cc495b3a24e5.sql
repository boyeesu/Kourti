-- Fix remaining functions with missing search paths

-- Fix analyze_document function
CREATE OR REPLACE FUNCTION public.analyze_document(p_document_id uuid, p_content text, p_document_type text DEFAULT 'document'::text, p_analysis_type text DEFAULT 'general'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

-- Fix get_document_analysis function
CREATE OR REPLACE FUNCTION public.get_document_analysis(p_document_id uuid, p_analysis_type text DEFAULT 'general'::text)
RETURNS TABLE(id uuid, content text, status text, created_at timestamp with time zone, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;