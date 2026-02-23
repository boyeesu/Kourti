-- Security fix: Tighten storage bucket configuration
-- 1. Add file_size_limit and allowed_mime_types to the 'documents' bucket
-- 2. Create 'Chat_Storage' bucket with proper RLS policies

-- Fix documents bucket: add size limit (25MB) and MIME type restrictions
UPDATE storage.buckets
SET
  file_size_limit = 26214400,  -- 25MB
  allowed_mime_types = ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'audio/webm',
    'audio/mpeg',
    'audio/wav'
  ]
WHERE id = 'documents';

-- Create Chat_Storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'Chat_Storage',
  'Chat_Storage',
  false,
  10485760,  -- 10MB
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS policies for Chat_Storage bucket
-- Users can upload files scoped to their organization
CREATE POLICY IF NOT EXISTS "Chat_Storage: org-scoped upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'Chat_Storage'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM profiles WHERE user_id = auth.uid()
    )
  );

-- Users can read files from their organization
CREATE POLICY IF NOT EXISTS "Chat_Storage: org-scoped read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'Chat_Storage'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM profiles WHERE user_id = auth.uid()
    )
  );

-- Users can delete their own uploads
CREATE POLICY IF NOT EXISTS "Chat_Storage: owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'Chat_Storage'
    AND owner = auth.uid()
  );
