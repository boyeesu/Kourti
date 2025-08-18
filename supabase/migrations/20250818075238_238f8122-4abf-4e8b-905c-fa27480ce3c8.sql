-- Fix invoices foreign key relationship issues
-- Remove invalid foreign key constraints if they exist
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_created_by_fkey;

-- Add proper foreign key constraint for created_by to reference auth.users
-- Note: We can't create foreign keys to auth.users in public schema directly
-- Instead, we'll ensure the column exists and is properly typed
ALTER TABLE public.invoices 
  ALTER COLUMN created_by SET DATA TYPE uuid;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON public.invoices(created_by);

-- Update any null organization_id values in existing tables if needed
UPDATE public.case_types SET organization_id = (
  SELECT organization_id FROM public.profiles WHERE user_id = case_types.created_by LIMIT 1
) WHERE organization_id IS NULL AND created_by IS NOT NULL;

UPDATE public.case_issues SET organization_id = (
  SELECT organization_id FROM public.profiles WHERE user_id = case_issues.case_type_id LIMIT 1
) WHERE organization_id IS NULL;

UPDATE public.case_fields SET organization_id = (
  SELECT organization_id FROM public.profiles WHERE user_id = case_fields.created_by LIMIT 1
) WHERE organization_id IS NULL AND created_by IS NOT NULL;