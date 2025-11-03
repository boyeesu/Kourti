import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { HttpError, createErrorResponse } from "../_shared/httpError.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sanitizeExtractedText(text: string): string {
  return text
    .replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const extractDocumentTextHandler = async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      throw new HttpError("Missing Authorization header", 401, "UNAUTHORIZED");
    }

    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!accessToken) {
      throw new HttpError("Invalid Authorization header", 401, "UNAUTHORIZED");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new HttpError("Supabase configuration missing", 500, "SUPABASE_CONFIG_MISSING");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);

    if (userError || !userData?.user) {
      throw new HttpError("Unauthorized", 401, "UNAUTHORIZED");
    }

    const user = userData.user;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      const status = profileError.code === "PGRST116" ? 404 : 500;
      throw new HttpError(
        profileError.code === "PGRST116" ? "User organization not found" : "Failed to load user organization",
        status,
        profileError.code === "PGRST116" ? "USER_ORGANIZATION_NOT_FOUND" : "USER_ORGANIZATION_LOAD_FAILED",
        { supabaseCode: profileError.code },
      );
    }

    const organizationId = (profile as { organization_id?: string } | null)?.organization_id;

    if (!organizationId) {
      throw new HttpError("User does not belong to an organization", 403, "FORBIDDEN");
    }

    let payload: any;

    try {
      payload = await req.json();
    } catch {
      throw new HttpError("Invalid JSON payload", 400, "INVALID_JSON");
    }

    const { documentId, contractId, filePath, documentType } = payload ?? {};

    if (!documentId && !contractId) {
      throw new HttpError("Document or contract ID is required", 400, "INVALID_INPUT");
    }

    if (!filePath) {
      throw new HttpError("filePath is required for extraction", 400, "INVALID_INPUT");
    }

    let storagePath: string | null = null;

    if (documentId) {
      const { data: document, error: documentError } = await supabase
        .from("documents")
        .select("id, organization_id, file_path, name")
        .eq("id", documentId)
        .single();

      if (documentError) {
        const status = documentError.code === "PGRST116" ? 404 : 500;
        throw new HttpError(
          documentError.code === "PGRST116" ? "Document not found" : "Failed to load document",
          status,
          documentError.code === "PGRST116" ? "DOCUMENT_NOT_FOUND" : "DOCUMENT_LOOKUP_FAILED",
          { supabaseCode: documentError.code },
        );
      }

      if (document.organization_id !== organizationId) {
        throw new HttpError("Unauthorized to access this document", 403, "FORBIDDEN");
      }

      storagePath = document.file_path || filePath;
    } else if (contractId) {
      const { data: contract, error: contractError } = await supabase
        .from("contracts")
        .select("id, organization_id")
        .eq("id", contractId)
        .maybeSingle();

      if (contractError) {
        const status = contractError.code === "PGRST116" ? 404 : 500;
        throw new HttpError(
          contractError.code === "PGRST116" ? "Contract not found" : "Failed to load contract",
          status,
          contractError.code === "PGRST116" ? "CONTRACT_NOT_FOUND" : "CONTRACT_LOOKUP_FAILED",
          { supabaseCode: contractError.code },
        );
      }

      if (!contract || contract.organization_id !== organizationId) {
        throw new HttpError("Unauthorized to access this contract", 403, "FORBIDDEN");
      }

      storagePath = filePath;
    }

    if (!storagePath) {
      throw new HttpError("Unable to resolve storage path for extraction", 400, "INVALID_INPUT");
    }

    if (!storagePath.startsWith(`${organizationId}/`)) {
      throw new HttpError("Unauthorized to access requested file", 403, "FORBIDDEN");
    }

    const { data: downloadData, error: downloadError } = await supabase.storage
      .from("documents")
      .download(storagePath);

    if (downloadError || !downloadData) {
      throw new HttpError(
        "Failed to download document for extraction",
        404,
        "DOCUMENT_DOWNLOAD_FAILED",
        { supabaseCode: downloadError?.code },
      );
    }

    const arrayBuffer = await downloadData.arrayBuffer();
    const decodedText = new TextDecoder("utf-8", { fatal: false }).decode(arrayBuffer);
    const sanitizedText = sanitizeExtractedText(decodedText);

    if (!sanitizedText) {
      throw new HttpError("No text could be extracted from the document", 422, "NO_TEXT_EXTRACTED");
    }

    return new Response(
      JSON.stringify({
        success: true,
        text: sanitizedText,
        documentId: documentId ?? contractId,
        documentType: documentType ?? (documentId ? "document" : "contract"),
        characters: sanitizedText.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("extract-document-text error", error);
    return createErrorResponse(error, corsHeaders, "Failed to extract document text");
  }
};

// @ts-ignore - Deno specific
if (import.meta.main) {
  serve(extractDocumentTextHandler);
}
