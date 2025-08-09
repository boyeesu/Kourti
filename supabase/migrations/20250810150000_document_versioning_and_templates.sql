-- 20250810150000_document_versioning_and_templates.sql
-- Document versioning + template support

SET search_path = auth, public;

--------------------------------------------------------------------
-- 1. Templates table
--------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.doc_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  content text NOT NULL,                -- raw md/plain text with {{placeholders}}
  variables text[],                     -- list of placeholder names
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_templates_org ON public.doc_templates(organization_id);

--------------------------------------------------------------------
-- 2. Extend documents table for versioning / template link
--------------------------------------------------------------------
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS previous_version_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.doc_templates(id) ON DELETE SET NULL;

-- ensure history uniqueness (one active record per doc path if desired) - optional

--------------------------------------------------------------------
-- 3. Function & trigger to auto-increment version when uploading new version (same file path / same parent doc)
--------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bump_document_version()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  latest integer;
BEGIN
  -- If previous_version_id supplied, inherit version = latest +1
  IF NEW.previous_version_id IS NOT NULL THEN
    SELECT version INTO latest FROM public.documents WHERE id = NEW.previous_version_id;
    NEW.version := COALESCE(latest,0) + 1;
  END IF;
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_bump_doc_version ON public.documents;
CREATE TRIGGER trg_bump_doc_version BEFORE INSERT ON public.documents
FOR EACH ROW EXECUTE PROCEDURE public.bump_document_version();

--------------------------------------------------------------------
-- 4. RLS policies (reuse existing org policy if any). Ensure new columns accessible.
--------------------------------------------------------------------
-- Assuming documents already RLS-enabled, just grant new columns
GRANT UPDATE(version,previous_version_id,template_id) ON public.documents TO authenticated;

ALTER TABLE public.doc_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members template access" ON public.doc_templates
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.doc_templates TO authenticated;
