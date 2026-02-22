-- Fix duplicate foreign key constraints causing cases query errors
ALTER TABLE public.cases DROP CONSTRAINT IF EXISTS fk_cases_client_id;

-- Create invoices table with comprehensive billing features
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'cancelled', 'overdue')),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  notes TEXT,
  terms_conditions TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, invoice_number)
);

-- Create invoice line items table
CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  rate DECIMAL(10,2) NOT NULL DEFAULT 0,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create invoice templates table
CREATE TABLE public.invoice_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  default_terms TEXT,
  default_notes TEXT,
  default_tax_rate DECIMAL(5,2) DEFAULT 0,
  is_default BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add user status and password reset fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'pending')),
ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS disabled_by UUID REFERENCES auth.users(id);

-- Enable RLS on new tables
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies for invoices
CREATE POLICY "Users can view their organization invoices" 
ON public.invoices FOR SELECT 
USING (organization_id = get_user_organization_id());

CREATE POLICY "Users can create invoices for their organization" 
ON public.invoices FOR INSERT 
WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Users can update their organization invoices" 
ON public.invoices FOR UPDATE 
USING (organization_id = get_user_organization_id());

CREATE POLICY "Admins can delete invoices" 
ON public.invoices FOR DELETE 
USING (organization_id = get_user_organization_id() AND current_user_is_org_admin());

-- RLS policies for invoice items
CREATE POLICY "Users can view invoice items for their organization invoices" 
ON public.invoice_items FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.invoices i 
  WHERE i.id = invoice_items.invoice_id 
  AND i.organization_id = get_user_organization_id()
));

CREATE POLICY "Users can manage invoice items for their organization invoices" 
ON public.invoice_items FOR ALL 
USING (EXISTS (
  SELECT 1 FROM public.invoices i 
  WHERE i.id = invoice_items.invoice_id 
  AND i.organization_id = get_user_organization_id()
));

-- RLS policies for invoice templates
CREATE POLICY "Users can view their organization templates" 
ON public.invoice_templates FOR SELECT 
USING (organization_id = get_user_organization_id());

CREATE POLICY "Users can create templates for their organization" 
ON public.invoice_templates FOR INSERT 
WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Users can update their organization templates" 
ON public.invoice_templates FOR UPDATE 
USING (organization_id = get_user_organization_id());

CREATE POLICY "Admins can delete templates" 
ON public.invoice_templates FOR DELETE 
USING (organization_id = get_user_organization_id() AND current_user_is_org_admin());

-- Create triggers for updated_at timestamps
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoice_items_updated_at
  BEFORE UPDATE ON public.invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoice_templates_updated_at
  BEFORE UPDATE ON public.invoice_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to generate invoice numbers
CREATE OR REPLACE FUNCTION public.generate_invoice_number(org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_number INTEGER;
  current_year TEXT;
  invoice_number TEXT;
BEGIN
  current_year := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 'INV-' || current_year || '-(.*)') AS INTEGER)), 0) + 1
  INTO next_number
  FROM public.invoices
  WHERE organization_id = org_id
  AND invoice_number LIKE 'INV-' || current_year || '-%';
  
  invoice_number := 'INV-' || current_year || '-' || LPAD(next_number::TEXT, 4, '0');
  
  RETURN invoice_number;
END;
$$;

-- Function to disable user (for super admins)
CREATE OR REPLACE FUNCTION public.disable_user(target_user_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  current_user_role text;
  current_org_id uuid;
BEGIN
  -- Get current user's role and organization
  select role::text, organization_id into current_user_role, current_org_id
  from public.profiles
  where user_id = auth.uid();

  IF current_user_role NOT IN ('superadmin') THEN
    return json_build_object('error','Only superadmins can disable users');
  END IF;

  -- Update the target user's status
  UPDATE public.profiles
  SET status = 'disabled',
      disabled_at = now(),
      disabled_by = auth.uid(),
      updated_at = now()
  WHERE user_id = target_user_id
  AND organization_id = current_org_id;

  -- Also disable their auth account
  UPDATE auth.users
  SET banned_until = 'infinity'
  WHERE id = target_user_id;

  return json_build_object('success', true, 'message', 'User disabled successfully');
END;
$$;

-- Function to enable user (for super admins)
CREATE OR REPLACE FUNCTION public.enable_user(target_user_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  current_user_role text;
  current_org_id uuid;
BEGIN
  -- Get current user's role and organization
  select role::text, organization_id into current_user_role, current_org_id
  from public.profiles
  where user_id = auth.uid();

  IF current_user_role NOT IN ('superadmin') THEN
    return json_build_object('error','Only superadmins can enable users');
  END IF;

  -- Update the target user's status
  UPDATE public.profiles
  SET status = 'active',
      disabled_at = NULL,
      disabled_by = NULL,
      updated_at = now()
  WHERE user_id = target_user_id
  AND organization_id = current_org_id;

  -- Also enable their auth account
  UPDATE auth.users
  SET banned_until = NULL
  WHERE id = target_user_id;

  return json_build_object('success', true, 'message', 'User enabled successfully');
END;
$$;