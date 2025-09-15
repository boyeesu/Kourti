-- Fix security warnings by setting search_path for functions

-- Update existing functions to have proper search_path
ALTER FUNCTION public.has_role(uuid, app_role) SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.bump_document_version() SET search_path = public;