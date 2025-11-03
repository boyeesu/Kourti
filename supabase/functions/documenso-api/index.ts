import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

import { buildCorsHeaders } from "../_shared/cors.ts";

const documensoBaseUrl = (Deno.env.get("DOCUMENSO_BASE_URL") || Deno.env.get("DOCUMENSO_URL") || "").replace(/\/+$/, "");
const documensoApiKey = Deno.env.get("DOCUMENSO_API_KEY") || Deno.env.get("DOCUMENSO_SECRET_KEY") || "";

type UploadPayload = {
  action: "upload";
  file: { data: string; name: string; type?: string };
};

type AddSignerPayload = {
  action: "addSigner";
  documentId: string;
  recipient: { name: string; email: string };
};

type GetSigningUrlPayload = {
  action: "getSigningUrl";
  documentId: string;
  recipientId: string;
};

type ShareDocumentPayload = {
  action: "shareDocument";
  documentId: string;
  email: string;
  message?: string;
};

type DocumensoRequest = UploadPayload | AddSignerPayload | GetSigningUrlPayload | ShareDocumentPayload;

function buildHeaders(initial?: HeadersInit) {
  const headers = new Headers(initial);
  headers.set("Authorization", `Bearer ${documensoApiKey}`);
  return headers;
}

function ensureConfigured() {
  if (!documensoBaseUrl || !documensoApiKey) {
    throw new Error("Documenso credentials are not configured.");
  }
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function jsonResponse(body: unknown, status = 200, corsHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...(corsHeaders ?? {}), "Content-Type": "application/json" },
  });
}

async function parseJsonSafe(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (_error) {
    return { raw: text };
  }
}

async function handleUpload(payload: UploadPayload) {
  if (!payload.file?.data || !payload.file.name) {
    throw new Error("File payload missing required fields.");
  }

  const bytes = base64ToBytes(payload.file.data);
  const blob = new Blob([bytes], { type: payload.file.type || "application/octet-stream" });
  const file = new File([blob], payload.file.name, { type: payload.file.type || "application/octet-stream" });

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${documensoBaseUrl}/v1/documents/upload`, {
    method: "POST",
    headers: buildHeaders(),
    body: formData,
  });

  const result = await parseJsonSafe(response);

  if (!response.ok) {
    console.error("Documenso upload failed", result);
    throw new Error(result?.message || "Documenso upload failed");
  }

  const documentId = result?.id || result?.document?.id || result?.data?.id;
  if (!documentId) {
    throw new Error("Unable to determine uploaded document ID.");
  }

  return { id: documentId };
}

async function handleAddSigner(payload: AddSignerPayload) {
  if (!payload.documentId) {
    throw new Error("Document ID is required.");
  }

  const response = await fetch(`${documensoBaseUrl}/v1/documents/${payload.documentId}/recipients`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      name: payload.recipient.name,
      email: payload.recipient.email,
      role: "signer",
    }),
  });

  const result = await parseJsonSafe(response);

  if (!response.ok) {
    console.error("Documenso add signer failed", result);
    throw new Error(result?.message || "Failed to add signer");
  }

  const recipientId = result?.id || result?.recipient?.id || result?.data?.id;
  if (!recipientId) {
    throw new Error("Unable to determine recipient ID.");
  }

  return { recipientId };
}

async function handleGetSigningUrl(payload: GetSigningUrlPayload) {
  if (!payload.documentId || !payload.recipientId) {
    throw new Error("Document ID and recipient ID are required.");
  }

  const response = await fetch(`${documensoBaseUrl}/v1/documents/${payload.documentId}/recipients/${payload.recipientId}/signing-url`, {
    method: "GET",
    headers: buildHeaders(),
  });

  const result = await parseJsonSafe(response);

  if (!response.ok) {
    console.error("Documenso get signing URL failed", result);
    throw new Error(result?.message || "Failed to fetch signing URL");
  }

  const url = result?.url || result?.signing_url || result?.data?.url;
  if (!url) {
    throw new Error("Documenso did not return a signing URL.");
  }

  return { url };
}

async function handleShareDocument(payload: ShareDocumentPayload) {
  if (!payload.documentId || !payload.email) {
    throw new Error("Document ID and email are required.");
  }

  const response = await fetch(`${documensoBaseUrl}/v1/documents/${payload.documentId}/share`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      emails: [payload.email],
      message: payload.message ?? "",
    }),
  });

  const result = await parseJsonSafe(response);

  if (!response.ok) {
    console.error("Documenso share document failed", result);
    throw new Error(result?.message || "Failed to share document");
  }

  return { success: true };
}

serve(async (req: Request) => {
  const { headers: corsHeaders, isAllowed } = buildCorsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    if (!isAllowed) {
      return new Response("Origin not allowed", { status: 403, headers: corsHeaders });
    }
    return new Response("ok", { headers: corsHeaders });
  }

  if (!isAllowed) {
    return new Response("Origin not allowed", { status: 403, headers: corsHeaders });
  }

  try {
    ensureConfigured();

    const payload = (await req.json()) as DocumensoRequest;

    switch (payload.action) {
      case "upload":
        return jsonResponse(await handleUpload(payload), 200, corsHeaders);
      case "addSigner":
        return jsonResponse(await handleAddSigner(payload), 200, corsHeaders);
      case "getSigningUrl":
        return jsonResponse(await handleGetSigningUrl(payload), 200, corsHeaders);
      case "shareDocument":
        return jsonResponse(await handleShareDocument(payload), 200, corsHeaders);
      default:
        return jsonResponse({ error: "Unsupported action" }, 400, corsHeaders);
    }
  } catch (error) {
    console.error("Documenso function error", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});
