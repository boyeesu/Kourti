-- Create organization table
CREATE TABLE public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Create profiles table for user information
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  role TEXT DEFAULT 'user',
  department TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create clients table
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  company TEXT,
  notes TEXT,
  status TEXT DEFAULT 'active',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on clients
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Create cases table
CREATE TABLE public.cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  case_number TEXT UNIQUE,
  status TEXT DEFAULT 'open',
  priority TEXT DEFAULT 'medium',
  assigned_to UUID REFERENCES auth.users(id),
  court TEXT,
  next_hearing_date TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on cases
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

-- Create documents table
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT,
  file_type TEXT,
  file_size INTEGER,
  category TEXT,
  tags TEXT[],
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on documents
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Create contracts table
CREATE TABLE public.contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  contract_type TEXT,
  status TEXT DEFAULT 'draft',
  value DECIMAL(15,2),
  currency TEXT DEFAULT 'USD',
  start_date DATE,
  end_date DATE,
  terms TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on contracts
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

-- Create calendar_events table
CREATE TABLE public.calendar_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  location TEXT,
  attendees TEXT[],
  event_type TEXT DEFAULT 'meeting',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on calendar_events
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

-- Create settings table
CREATE TABLE public.settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB,
  category TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, key)
);

-- Enable RLS on settings
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Create function to get user's organization ID
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID AS $$
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cases_updated_at
  BEFORE UPDATE ON public.cases
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contracts_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies for Organizations
CREATE POLICY "Users can view their organization" 
  ON public.organizations 
  FOR SELECT 
  USING (id = public.get_user_organization_id());

CREATE POLICY "Users can update their organization" 
  ON public.organizations 
  FOR UPDATE 
  USING (id = public.get_user_organization_id());

-- RLS Policies for Profiles
CREATE POLICY "Users can view all profiles in their organization" 
  ON public.profiles 
  FOR SELECT 
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update their own profile" 
  ON public.profiles 
  FOR UPDATE 
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own profile" 
  ON public.profiles 
  FOR INSERT 
  WITH CHECK (user_id = auth.uid());

-- RLS Policies for Clients
CREATE POLICY "Users can view clients in their organization" 
  ON public.clients 
  FOR SELECT 
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can create clients in their organization" 
  ON public.clients 
  FOR INSERT 
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update clients in their organization" 
  ON public.clients 
  FOR UPDATE 
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can delete clients in their organization" 
  ON public.clients 
  FOR DELETE 
  USING (organization_id = public.get_user_organization_id());

-- RLS Policies for Cases
CREATE POLICY "Users can view cases in their organization" 
  ON public.cases 
  FOR SELECT 
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can create cases in their organization" 
  ON public.cases 
  FOR INSERT 
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update cases in their organization" 
  ON public.cases 
  FOR UPDATE 
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can delete cases in their organization" 
  ON public.cases 
  FOR DELETE 
  USING (organization_id = public.get_user_organization_id());

-- RLS Policies for Documents
CREATE POLICY "Users can view documents in their organization" 
  ON public.documents 
  FOR SELECT 
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can create documents in their organization" 
  ON public.documents 
  FOR INSERT 
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update documents in their organization" 
  ON public.documents 
  FOR UPDATE 
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can delete documents in their organization" 
  ON public.documents 
  FOR DELETE 
  USING (organization_id = public.get_user_organization_id());

-- RLS Policies for Contracts
CREATE POLICY "Users can view contracts in their organization" 
  ON public.contracts 
  FOR SELECT 
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can create contracts in their organization" 
  ON public.contracts 
  FOR INSERT 
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update contracts in their organization" 
  ON public.contracts 
  FOR UPDATE 
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can delete contracts in their organization" 
  ON public.contracts 
  FOR DELETE 
  USING (organization_id = public.get_user_organization_id());

-- RLS Policies for Calendar Events
CREATE POLICY "Users can view calendar events in their organization" 
  ON public.calendar_events 
  FOR SELECT 
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can create calendar events in their organization" 
  ON public.calendar_events 
  FOR INSERT 
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update calendar events in their organization" 
  ON public.calendar_events 
  FOR UPDATE 
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can delete calendar events in their organization" 
  ON public.calendar_events 
  FOR DELETE 
  USING (organization_id = public.get_user_organization_id());

-- RLS Policies for Settings
CREATE POLICY "Users can view settings in their organization" 
  ON public.settings 
  FOR SELECT 
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can create settings in their organization" 
  ON public.settings 
  FOR INSERT 
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update settings in their organization" 
  ON public.settings 
  FOR UPDATE 
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can delete settings in their organization" 
  ON public.settings 
  FOR DELETE 
  USING (organization_id = public.get_user_organization_id());

-- Create function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, first_name, last_name, email)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();