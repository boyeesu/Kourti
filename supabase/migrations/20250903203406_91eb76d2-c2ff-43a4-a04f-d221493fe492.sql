-- Fix the last function with missing search path - match_best_practices
CREATE OR REPLACE FUNCTION public.match_best_practices(query extensions.vector)
RETURNS TABLE(id uuid, clause text, similarity double precision)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT id, clause,
         1 - (embedding <=> query) AS similarity
  FROM best_practices
  ORDER BY embedding <=> query
  LIMIT 5;
$function$;