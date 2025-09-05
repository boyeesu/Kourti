-- Add client_id column to documents table to link documents to clients
ALTER TABLE public.documents 
ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;