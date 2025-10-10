-- ============================================================================
-- PHASE 1-3: Critical Security, Schema Consolidation & Email Resolution
-- ============================================================================

-- PHASE 3: Add email column to profiles (do this first for foreign key dependencies)
-- ============================================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- Sync existing emails from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.user_id = u.id AND p.email IS NULL;

-- Update trigger to maintain email sync
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sync email from auth.users to profiles
  UPDATE public.profiles
  SET email = NEW.email
  WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;

-- Create trigger for email updates
DROP TRIGGER IF EXISTS on_auth_user_email_change ON auth.users;
CREATE TRIGGER on_auth_user_email_change
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_profile_email();


-- PHASE 1.1: Handle NULL organization_id values before adding constraints
-- ============================================================================

-- For case_types: Set to a default organization or mark as global
UPDATE public.case_types
SET is_global = true
WHERE organization_id IS NULL;

-- For case_issues: Set to global
UPDATE public.case_issues
SET is_global = true
WHERE organization_id IS NULL;

-- For case_fields: These should have an organization - log warning if any found
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count FROM public.case_fields WHERE organization_id IS NULL;
  IF null_count > 0 THEN
    RAISE WARNING 'Found % case_fields with NULL organization_id - these will need manual review', null_count;
  END IF;
END $$;

-- For document_chunks: Get organization from parent document
UPDATE public.document_chunks dc
SET organization_id = d.organization_id
FROM public.documents d
WHERE dc.document_id = d.id AND dc.organization_id IS NULL;

-- For voice_transcriptions: Add organization_id column if not exists and populate
ALTER TABLE public.voice_transcriptions ADD COLUMN IF NOT EXISTS organization_id UUID;

UPDATE public.voice_transcriptions vt
SET organization_id = c.organization_id
FROM public.cases c
WHERE vt.case_id = c.id AND vt.organization_id IS NULL;

-- For contract_templates: Already has organization_id, handle NULLs by marking public
UPDATE public.contract_templates
SET is_public = true
WHERE organization_id IS NULL;

-- For user_role_assignments: Get from user's profile
UPDATE public.user_role_assignments ura
SET organization_id = p.organization_id
FROM public.profiles p
WHERE ura.user_id = p.user_id AND ura.organization_id IS NULL;


-- PHASE 1.2: Add NOT NULL constraints after cleaning data
-- ============================================================================

-- Only add NOT NULL where we can guarantee data integrity
-- Skip tables where NULL is intentionally allowed (global items)

ALTER TABLE public.case_fields 
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.document_chunks 
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.voice_transcriptions 
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.user_role_assignments 
  ALTER COLUMN organization_id SET NOT NULL;


-- PHASE 1.3: Add Foreign Key Constraints to Organizations
-- ============================================================================

-- Add foreign keys with CASCADE for tenant data
ALTER TABLE public.case_types 
  DROP CONSTRAINT IF EXISTS fk_case_types_organization,
  ADD CONSTRAINT fk_case_types_organization 
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.case_issues 
  DROP CONSTRAINT IF EXISTS fk_case_issues_organization,
  ADD CONSTRAINT fk_case_issues_organization 
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.case_fields 
  DROP CONSTRAINT IF EXISTS fk_case_fields_organization,
  ADD CONSTRAINT fk_case_fields_organization 
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.document_chunks 
  DROP CONSTRAINT IF EXISTS fk_document_chunks_organization,
  ADD CONSTRAINT fk_document_chunks_organization 
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.voice_transcriptions 
  DROP CONSTRAINT IF EXISTS fk_voice_transcriptions_organization,
  ADD CONSTRAINT fk_voice_transcriptions_organization 
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.contract_templates 
  DROP CONSTRAINT IF EXISTS fk_contract_templates_organization,
  ADD CONSTRAINT fk_contract_templates_organization 
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.user_role_assignments 
  DROP CONSTRAINT IF EXISTS fk_user_role_assignments_organization,
  ADD CONSTRAINT fk_user_role_assignments_organization 
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- PHASE 1.4: Standardize User References to Profiles
-- ============================================================================

-- Cases table
ALTER TABLE public.cases 
  DROP CONSTRAINT IF EXISTS cases_created_by_fkey,
  ADD CONSTRAINT fk_cases_created_by_profile 
  FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

ALTER TABLE public.cases 
  DROP CONSTRAINT IF EXISTS cases_assigned_to_fkey,
  ADD CONSTRAINT fk_cases_assigned_to_profile 
  FOREIGN KEY (assigned_to) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

-- Documents table
ALTER TABLE public.documents 
  DROP CONSTRAINT IF EXISTS documents_created_by_fkey,
  ADD CONSTRAINT fk_documents_created_by_profile 
  FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

-- Contracts table
ALTER TABLE public.contracts 
  DROP CONSTRAINT IF EXISTS contracts_created_by_fkey,
  ADD CONSTRAINT fk_contracts_created_by_profile 
  FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

-- Invoices table
ALTER TABLE public.invoices 
  DROP CONSTRAINT IF EXISTS invoices_created_by_fkey,
  ADD CONSTRAINT fk_invoices_created_by_profile 
  FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

-- Communication logs table
ALTER TABLE public.communication_logs 
  DROP CONSTRAINT IF EXISTS communication_logs_user_id_fkey,
  ADD CONSTRAINT fk_communication_logs_user_profile 
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- Clients table
ALTER TABLE public.clients 
  DROP CONSTRAINT IF EXISTS clients_created_by_fkey,
  ADD CONSTRAINT fk_clients_created_by_profile 
  FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

-- Calendar events
ALTER TABLE public.calendar_events 
  DROP CONSTRAINT IF EXISTS calendar_events_created_by_fkey,
  ADD CONSTRAINT fk_calendar_events_created_by_profile 
  FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

-- Case activities
ALTER TABLE public.case_activities 
  DROP CONSTRAINT IF EXISTS case_activities_created_by_fkey,
  ADD CONSTRAINT fk_case_activities_created_by_profile 
  FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

ALTER TABLE public.case_activities 
  DROP CONSTRAINT IF EXISTS case_activities_assigned_to_fkey,
  ADD CONSTRAINT fk_case_activities_assigned_to_profile 
  FOREIGN KEY (assigned_to) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

-- Tasks
ALTER TABLE public.tasks 
  DROP CONSTRAINT IF EXISTS tasks_created_by_fkey,
  ADD CONSTRAINT fk_tasks_created_by_profile 
  FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

ALTER TABLE public.tasks 
  DROP CONSTRAINT IF EXISTS tasks_assigned_to_fkey,
  ADD CONSTRAINT fk_tasks_assigned_to_profile 
  FOREIGN KEY (assigned_to) REFERENCES public.profiles(user_id) ON DELETE SET NULL;


-- PHASE 2: Update RLS policies for voice_transcriptions with new organization_id
-- ============================================================================

DROP POLICY IF EXISTS "Users can create voice transcriptions in their organization" ON public.voice_transcriptions;
CREATE POLICY "Users can create voice transcriptions in their organization"
  ON public.voice_transcriptions FOR INSERT
  WITH CHECK (organization_id = get_current_user_organization_id());

DROP POLICY IF EXISTS "Users can view voice transcriptions in their organization" ON public.voice_transcriptions;
CREATE POLICY "Users can view voice transcriptions in their organization"
  ON public.voice_transcriptions FOR SELECT
  USING (organization_id = get_current_user_organization_id());

DROP POLICY IF EXISTS "Users can update voice transcriptions in their organization" ON public.voice_transcriptions;
CREATE POLICY "Users can update voice transcriptions in their organization"
  ON public.voice_transcriptions FOR UPDATE
  USING (organization_id = get_current_user_organization_id());

DROP POLICY IF EXISTS "Users can delete voice transcriptions in their organization" ON public.voice_transcriptions;
CREATE POLICY "Users can delete voice transcriptions in their organization"
  ON public.voice_transcriptions FOR DELETE
  USING (organization_id = get_current_user_organization_id());


-- Add helpful indexes for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_case_fields_organization_id ON public.case_fields(organization_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_organization_id ON public.document_chunks(organization_id);
CREATE INDEX IF NOT EXISTS idx_voice_transcriptions_organization_id ON public.voice_transcriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_organization_id ON public.user_role_assignments(organization_id);

-- Add index for email lookups on profiles
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email) WHERE email IS NOT NULL;