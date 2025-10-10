-- Add missing foreign key constraint for documents.created_by
-- This fixes the PostgREST error when fetching documents with creator profile

ALTER TABLE public.documents 
  DROP CONSTRAINT IF EXISTS documents_created_by_fkey;

ALTER TABLE public.documents 
  ADD CONSTRAINT documents_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;