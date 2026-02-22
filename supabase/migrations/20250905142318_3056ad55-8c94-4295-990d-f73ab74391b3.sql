-- Create storage bucket for documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', false);

-- Create RLS policies for document storage
CREATE POLICY "Users can view documents in their organization"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text 
    FROM profiles 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can upload documents to their organization folder"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text 
    FROM profiles 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update documents in their organization folder"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text 
    FROM profiles 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete documents in their organization folder"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text 
    FROM profiles 
    WHERE user_id = auth.uid()
  )
);

-- Add file_path column to documents table to store storage path
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS file_path text,
ADD COLUMN IF NOT EXISTS file_size bigint,
ADD COLUMN IF NOT EXISTS mime_type text;