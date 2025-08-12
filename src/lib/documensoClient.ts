// src/lib/documensoClient.ts
// Secure Documenso client that calls Edge Functions instead of exposing API keys

import { supabase } from '@/integrations/supabase/client';

interface UploadResponse {
  id: string
}

interface AddSignerResponse {
  recipientId: string
}

interface SigningUrlResponse {
  url: string
}

interface ShareDocumentResponse {
  success: boolean
}

/**
 * Upload a File to Documenso and create a document record
 */
export async function uploadDocument(file: File): Promise<UploadResponse> {
  // Convert file to base64 for transmission to edge function
  const arrayBuffer = await file.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
  
  const { data, error } = await supabase.functions.invoke('documenso-api', {
    body: {
      action: 'upload',
      file: {
        data: base64,
        name: file.name,
        type: file.type
      }
    }
  });

  if (error) {
    throw new Error(`Documenso upload failed: ${error.message}`);
  }
  
  return data;
}

/**
 * Add a signer (recipient) to an existing Documenso document
 */
export async function addSigner(
  documentId: string,
  recipient: { name: string; email: string }
): Promise<AddSignerResponse> {
  const { data, error } = await supabase.functions.invoke('documenso-api', {
    body: {
      action: 'addSigner',
      documentId,
      recipient
    }
  });

  if (error) {
    throw new Error(`Documenso add signer failed: ${error.message}`);
  }
  
  return data;
}

/**
 * Retrieve a signing URL for a specific recipient
 */
export async function getSigningUrl(
  documentId: string,
  recipientId: string
): Promise<SigningUrlResponse> {
  const { data, error } = await supabase.functions.invoke('documenso-api', {
    body: {
      action: 'getSigningUrl',
      documentId,
      recipientId
    }
  });

  if (error) {
    throw new Error(`Documenso get signing URL failed: ${error.message}`);
  }
  
  return data;
}

/**
 * Share a document via email with an optional message
 */
export async function shareDocument(
  documentId: string,
  email: string,
  message: string
): Promise<ShareDocumentResponse> {
  const { data, error } = await supabase.functions.invoke('documenso-api', {
    body: {
      action: 'shareDocument',
      documentId,
      email,
      message,
    },
  });

  if (error) {
    throw new Error(`Documenso share document failed: ${error.message}`);
  }

  return data;
}
