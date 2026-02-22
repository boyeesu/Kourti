-- Fix function search path security issue by setting search_path for functions that don't have it

-- Update functions that don't have search_path set to 'public'
CREATE OR REPLACE FUNCTION public.match_best_practices(query extensions.vector)
 RETURNS TABLE(id uuid, clause text, similarity double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, clause,
         1 - (embedding <=> query) AS similarity
  FROM best_practices
  ORDER BY embedding <=> query
  LIMIT 5;
$function$;

CREATE OR REPLACE FUNCTION public.bump_document_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  latest integer;
BEGIN
  -- If previous_version_id supplied, inherit version = latest +1
  IF NEW.previous_version_id IS NOT NULL THEN
    SELECT version INTO latest FROM public.documents WHERE id = NEW.previous_version_id;
    NEW.version := COALESCE(latest,0) + 1;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_document_chunks_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_tasks_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;