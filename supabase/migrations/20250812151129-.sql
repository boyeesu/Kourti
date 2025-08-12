-- Enable RLS on case_types table
ALTER TABLE public.case_types ENABLE ROW LEVEL SECURITY;

-- Enable RLS on case_fields table  
ALTER TABLE public.case_fields ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for case_types table
-- Users can view case types in their organization
CREATE POLICY "Users can view case types in their organization" 
ON public.case_types 
FOR SELECT 
USING (organization_id = get_user_organization_id());

-- Users can create case types in their organization
CREATE POLICY "Users can create case types in their organization" 
ON public.case_types 
FOR INSERT 
WITH CHECK (organization_id = get_user_organization_id());

-- Users can update case types in their organization
CREATE POLICY "Users can update case types in their organization" 
ON public.case_types 
FOR UPDATE 
USING (organization_id = get_user_organization_id());

-- Users can delete case types in their organization
CREATE POLICY "Users can delete case types in their organization" 
ON public.case_types 
FOR DELETE 
USING (organization_id = get_user_organization_id());

-- Create RLS policies for case_fields table
-- Users can view case fields for case types in their organization
CREATE POLICY "Users can view case fields in their organization" 
ON public.case_fields 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.case_types ct 
  WHERE ct.id = case_fields.case_type_id 
  AND ct.organization_id = get_user_organization_id()
));

-- Users can create case fields for case types in their organization
CREATE POLICY "Users can create case fields in their organization" 
ON public.case_fields 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.case_types ct 
  WHERE ct.id = case_fields.case_type_id 
  AND ct.organization_id = get_user_organization_id()
));

-- Users can update case fields for case types in their organization
CREATE POLICY "Users can update case fields in their organization" 
ON public.case_fields 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.case_types ct 
  WHERE ct.id = case_fields.case_type_id 
  AND ct.organization_id = get_user_organization_id()
));

-- Users can delete case fields for case types in their organization
CREATE POLICY "Users can delete case fields in their organization" 
ON public.case_fields 
FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM public.case_types ct 
  WHERE ct.id = case_fields.case_type_id 
  AND ct.organization_id = get_user_organization_id()
));