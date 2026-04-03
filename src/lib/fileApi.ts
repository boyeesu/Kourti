/**
 * File storage API client -- replaces supabase.storage entirely.
 * All file operations go through the Node backend.
 */
import { env } from '@/lib/env';
import { getAccessToken, refreshSession } from '@/lib/authClient';

async function getToken(): Promise<string> {
  const token = getAccessToken();
  if (token) return token;
  const session = await refreshSession();
  return session.accessToken;
}

function fileUrl(path: string): string {
  return `${env.BACKEND_API_URL}/api/v1/files${path}`;
}

// ── Upload ──────────────────────────────────────────────────────────────────

export async function uploadDocument(file: File): Promise<{
  filePath: string;
  fileName: string;
  size: number;
  mimeType: string;
}> {
  const token = await getToken();
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(fileUrl('/documents/upload'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
    credentials: 'include',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || `Upload failed (${res.status})`);
  }

  return res.json();
}

export async function uploadChatFile(file: File): Promise<{
  filePath: string;
  fileName: string;
  size: number;
  mimeType: string;
}> {
  const token = await getToken();
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(fileUrl('/chat/upload'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
    credentials: 'include',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || `Upload failed (${res.status})`);
  }

  return res.json();
}

// ── Download ────────────────────────────────────────────────────────────────

export async function downloadDocument(filePath: string): Promise<Blob> {
  const token = await getToken();

  const res = await fetch(fileUrl(`/documents/download/${filePath}`), {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(`Download failed (${res.status})`);
  }

  return res.blob();
}

// ── Signed URLs ─────────────────────────────────────────────────────────────

export async function getDocumentSignedUrl(filePath: string, expiresIn = 3600): Promise<string> {
  const token = await getToken();

  const res = await fetch(
    fileUrl(
      `/documents/signed-url?filePath=${encodeURIComponent(filePath)}&expiresIn=${expiresIn}`
    ),
    {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to get signed URL (${res.status})`);
  }

  const data = await res.json();
  return data.signedUrl;
}

export async function getChatFileSignedUrl(filePath: string, expiresIn = 3600): Promise<string> {
  const token = await getToken();

  const res = await fetch(
    fileUrl(`/chat/signed-url?filePath=${encodeURIComponent(filePath)}&expiresIn=${expiresIn}`),
    {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to get signed URL (${res.status})`);
  }

  const data = await res.json();
  return data.signedUrl;
}

// ── Delete ──────────────────────────────────────────────────────────────────

export async function deleteDocumentFile(filePath: string): Promise<void> {
  const token = await getToken();

  const res = await fetch(fileUrl(`/documents/${filePath}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
  });

  if (!res.ok && res.status !== 404) {
    throw new Error(`Delete failed (${res.status})`);
  }
}

export async function deleteChatFile(filePath: string): Promise<void> {
  const token = await getToken();

  const res = await fetch(fileUrl(`/chat/${filePath}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
  });

  if (!res.ok && res.status !== 404) {
    throw new Error(`Delete failed (${res.status})`);
  }
}
