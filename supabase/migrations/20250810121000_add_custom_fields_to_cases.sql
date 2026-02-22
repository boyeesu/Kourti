-- 20250810121000_add_custom_fields_to_cases.sql
-- Add JSONB column to store custom field values on cases

SET search_path = auth, public;

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}'::jsonb;

-- Grant authenticated role permission to insert/update custom_fields
GRANT UPDATE(custom_fields), SELECT(custom_fields) ON public.cases TO authenticated;
