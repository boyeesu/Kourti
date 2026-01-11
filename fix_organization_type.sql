-- =============================================================================
-- FIX ORGANIZATION TYPE FIELD - RUN THIS IN SUPABASE SQL EDITOR
-- =============================================================================
-- Go to: https://supabase.com/dashboard/project/zjbvnvydgsxqmmrrmvif/sql
-- Copy and paste this entire script and click RUN
-- =============================================================================

-- Add organization type field to organizations table
-- This field was being collected in onboarding but not saved to DB
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS type TEXT;

-- Add check constraint for valid organization types
ALTER TABLE public.organizations
ADD CONSTRAINT organizations_type_check
CHECK (type IN ('law-firm', 'solo-practitioner', 'legal-clinic', 'corporate-legal-dept', 'government-agency', 'non-profit', 'academic-institution', 'other'));

-- Add comment
COMMENT ON COLUMN public.organizations.type IS 'Organization type as selected during onboarding';

-- Update existing organizations to have a default type if they were created without one
UPDATE public.organizations
SET type = 'other'
WHERE type IS NULL;

-- =============================================================================
-- VERIFY FIX
-- =============================================================================
SELECT
  'Organization type field added successfully' as status,
  COUNT(*) as total_organizations,
  COUNT(CASE WHEN type IS NOT NULL THEN 1 END) as organizations_with_type
FROM public.organizations;