-- 1. Add case_issue_id to cases table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'cases' 
    AND column_name = 'case_issue_id'
  ) THEN
    ALTER TABLE public.cases ADD COLUMN case_issue_id UUID REFERENCES public.case_issues(id);
  END IF;
END $$;

-- 2. Update RLS policies on cases table to enforce permissions
DROP POLICY IF EXISTS "Users can view cases in their organization" ON public.cases;
DROP POLICY IF EXISTS "Users can create cases in their organization" ON public.cases;
DROP POLICY IF EXISTS "Users can update cases in their organization" ON public.cases;
DROP POLICY IF EXISTS "Users can delete cases in their organization" ON public.cases;

-- Create new permission-based policies
CREATE POLICY "Users can view cases with read permission"
ON public.cases
FOR SELECT
TO authenticated
USING (
  organization_id = get_current_user_organization_id() 
  AND user_has_specific_permission(auth.uid(), 'cases', 'read')
);

CREATE POLICY "Users can create cases with create permission"
ON public.cases
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id = get_current_user_organization_id()
  AND user_has_specific_permission(auth.uid(), 'cases', 'create')
);

CREATE POLICY "Users can update cases with update permission"
ON public.cases
FOR UPDATE
TO authenticated
USING (
  organization_id = get_current_user_organization_id()
  AND user_has_specific_permission(auth.uid(), 'cases', 'update')
);

CREATE POLICY "Users can delete cases with delete permission"
ON public.cases
FOR DELETE
TO authenticated
USING (
  organization_id = get_current_user_organization_id()
  AND user_has_specific_permission(auth.uid(), 'cases', 'delete')
);