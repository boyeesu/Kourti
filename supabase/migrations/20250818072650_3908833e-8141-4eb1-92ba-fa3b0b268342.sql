-- Fix the get_user_organization_id function to use proper auth claims
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    org_id uuid;
BEGIN
    -- Get organization_id from profiles table for the current user
    SELECT organization_id INTO org_id
    FROM public.profiles
    WHERE user_id = auth.uid();
    
    -- If no organization found, return null instead of throwing error
    IF org_id IS NULL THEN
        RETURN NULL;
    END IF;
    
    RETURN org_id;
END;
$$;

-- Ensure case_types table exists with proper structure
CREATE TABLE IF NOT EXISTS public.case_types (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    description text,
    organization_id uuid NOT NULL,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    is_active boolean DEFAULT true
);

-- Ensure case_issues table exists with proper structure  
CREATE TABLE IF NOT EXISTS public.case_issues (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    description text,
    case_type_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Ensure case_fields table exists with proper structure
CREATE TABLE IF NOT EXISTS public.case_fields (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    case_type_id uuid NOT NULL,
    label text NOT NULL,
    field_key text NOT NULL,
    data_type text NOT NULL DEFAULT 'text',
    is_required boolean DEFAULT false,
    options jsonb DEFAULT '[]'::jsonb,
    field_order integer DEFAULT 0,
    organization_id uuid NOT NULL,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.case_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_issues ENABLE ROW LEVEL SECURITY;  
ALTER TABLE public.case_fields ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for case_types
DROP POLICY IF EXISTS "Users can view case types in their organization" ON public.case_types;
CREATE POLICY "Users can view case types in their organization"
ON public.case_types FOR SELECT
USING (organization_id = get_current_user_organization_id());

DROP POLICY IF EXISTS "Users can create case types in their organization" ON public.case_types;
CREATE POLICY "Users can create case types in their organization"
ON public.case_types FOR INSERT
WITH CHECK (organization_id = get_current_user_organization_id());

DROP POLICY IF EXISTS "Users can update case types in their organization" ON public.case_types;
CREATE POLICY "Users can update case types in their organization"
ON public.case_types FOR UPDATE
USING (organization_id = get_current_user_organization_id());

DROP POLICY IF EXISTS "Users can delete case types in their organization" ON public.case_types;
CREATE POLICY "Users can delete case types in their organization"
ON public.case_types FOR DELETE
USING (organization_id = get_current_user_organization_id());

-- Add RLS policies for case_issues
DROP POLICY IF EXISTS "Users can view case issues in their organization" ON public.case_issues;
CREATE POLICY "Users can view case issues in their organization"
ON public.case_issues FOR SELECT
USING (organization_id = get_current_user_organization_id());

DROP POLICY IF EXISTS "Users can create case issues in their organization" ON public.case_issues;
CREATE POLICY "Users can create case issues in their organization"
ON public.case_issues FOR INSERT
WITH CHECK (organization_id = get_current_user_organization_id());

DROP POLICY IF EXISTS "Users can update case issues in their organization" ON public.case_issues;
CREATE POLICY "Users can update case issues in their organization"
ON public.case_issues FOR UPDATE
USING (organization_id = get_current_user_organization_id());

DROP POLICY IF EXISTS "Users can delete case issues in their organization" ON public.case_issues;
CREATE POLICY "Users can delete case issues in their organization"
ON public.case_issues FOR DELETE
USING (organization_id = get_current_user_organization_id());

-- Add RLS policies for case_fields
DROP POLICY IF EXISTS "Users can view case fields in their organization" ON public.case_fields;
CREATE POLICY "Users can view case fields in their organization"
ON public.case_fields FOR SELECT
USING (organization_id = get_current_user_organization_id());

DROP POLICY IF EXISTS "Users can create case fields in their organization" ON public.case_fields;
CREATE POLICY "Users can create case fields in their organization"
ON public.case_fields FOR INSERT
WITH CHECK (organization_id = get_current_user_organization_id());

DROP POLICY IF EXISTS "Users can update case fields in their organization" ON public.case_fields;
CREATE POLICY "Users can update case fields in their organization"
ON public.case_fields FOR UPDATE
USING (organization_id = get_current_user_organization_id());

DROP POLICY IF EXISTS "Users can delete case fields in their organization" ON public.case_fields;
CREATE POLICY "Users can delete case fields in their organization"
ON public.case_fields FOR DELETE
USING (organization_id = get_current_user_organization_id());

-- Add triggers for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_case_types_updated_at ON public.case_types;
CREATE TRIGGER update_case_types_updated_at
    BEFORE UPDATE ON public.case_types
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_case_issues_updated_at ON public.case_issues;
CREATE TRIGGER update_case_issues_updated_at
    BEFORE UPDATE ON public.case_issues
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_case_fields_updated_at ON public.case_fields;
CREATE TRIGGER update_case_fields_updated_at
    BEFORE UPDATE ON public.case_fields
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();