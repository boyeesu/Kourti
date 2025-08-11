// src/lib/documensoClient.ts

const BASE_URL = import.meta.env.VITE_DOCUMENSO_URL || ''
const API_KEY = import.meta.env.VITE_DOCUMENSO_API_KEY || ''

interface UploadResponse {
  id: string
}

interface AddSignerResponse {
  recipientId: string
}

interface SigningUrlResponse {
  url: string
}

/**
 * Upload a File to Documenso and create a document record
 */
export async function uploadDocument(file: File): Promise<UploadResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(`${BASE_URL}/documents`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
    },
    body: formData,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Documenso upload failed: ${text}`)
  }
  return res.json()
}

/**
 * Add a signer (recipient) to an existing Documenso document
 */
export async function addSigner(
  documentId: string,
  recipient: { name: string; email: string }
): Promise<AddSignerResponse> {
  const res = await fetch(`${BASE_URL}/documents/${documentId}/signers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(recipient),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Documenso add signer failed: ${text}`)
  }
  return res.json()
}

/**
 * Retrieve a signing URL for a specific recipient
 */
export async function getSigningUrl(
  documentId: string,
  recipientId: string
): Promise<SigningUrlResponse> {
  const res = await fetch(
    `${BASE_URL}/documents/${documentId}/signers/${recipientId}/sign-url`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
    }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Documenso get signing URL failed: ${text}`)
  }
  return res.json()
}
