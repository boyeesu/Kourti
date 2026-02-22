-- First, let's check if the clients and cases tables have proper RLS policies
-- Add user_id column to clients table if it doesn't exist and create RLS policies
DO $$ 
BEGIN
    -- Add user_id column to clients if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'clients' 
                   AND column_name = 'user_id') THEN
        ALTER TABLE public.clients ADD COLUMN user_id UUID REFERENCES auth.users(id);
    END IF;
    
    -- Add user_id column to cases if it doesn't exist  
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'cases' 
                   AND column_name = 'user_id') THEN
        ALTER TABLE public.cases ADD COLUMN user_id UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- Enable RLS on clients table
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "Users can view their own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can create their own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can update their own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can delete their own clients" ON public.clients;

-- Create RLS policies for clients
CREATE POLICY "Users can view their own clients" 
ON public.clients FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own clients" 
ON public.clients FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clients" 
ON public.clients FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clients" 
ON public.clients FOR DELETE 
USING (auth.uid() = user_id);

-- Enable RLS on cases table
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "Users can view their own cases" ON public.cases;
DROP POLICY IF EXISTS "Users can create their own cases" ON public.cases;
DROP POLICY IF EXISTS "Users can update their own cases" ON public.cases;
DROP POLICY IF EXISTS "Users can delete their own cases" ON public.cases;

-- Create RLS policies for cases
CREATE POLICY "Users can view their own cases" 
ON public.cases FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own cases" 
ON public.cases FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cases" 
ON public.cases FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cases" 
ON public.cases FOR DELETE 
USING (auth.uid() = user_id);

-- Create a storage bucket for bulk imports if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('bulk-imports', 'bulk-imports', false)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for bulk imports
DROP POLICY IF EXISTS "Users can upload bulk import files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their bulk import files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their bulk import files" ON storage.objects;

CREATE POLICY "Users can upload bulk import files" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'bulk-imports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their bulk import files" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'bulk-imports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their bulk import files" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'bulk-imports' AND auth.uid()::text = (storage.foldername(name))[1]);