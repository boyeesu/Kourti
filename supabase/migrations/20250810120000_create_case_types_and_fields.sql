-- 20250810120000_create_case_types_and_fields.sql
-- Add customizable case types and fields

SET search_path = auth, public;

-- Create case_types table
CREATE TABLE IF NOT EXISTS public.case_types (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_by uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Create case_fields table
CREATE TABLE IF NOT EXISTS public.case_fields (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  case_type_id uuid NOT NULL REFERENCES public.case_types(id) ON DELETE CASCADE,
  label text NOT NULL,
  field_key text NOT NULL,
  data_type text NOT NULL,      -- e.g. 'text','number','date','select'
  required boolean DEFAULT FALSE,
  options jsonb,                -- for select fields: { "choices": ["A","B"] }
  field_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT case_fields_unique_key UNIQUE(case_type_id, field_key)
);

-- Add case_type_id to existing cases table
ALTER TABLE IF EXISTS public.cases
  ADD COLUMN IF NOT EXISTS case_type_id uuid REFERENCES public.case_types(id);
