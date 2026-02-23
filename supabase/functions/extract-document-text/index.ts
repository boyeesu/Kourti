import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { getDocument } from "https://esm.sh/pdfjs-serverless@0.6.0";
import { createEmptyResponse, createJsonResponse, CorsSecurityHeadersOptions } from "../_shared/responseHeaders.ts";
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMIT_PRESETS, createRateLimitHeaders } from "../_shared/rateLimiting.ts";
import { HttpError, createErrorResponse } from "../_shared/httpError.ts";
import { createErrorResponse as createSanitizedErrorResponse } from "../_shared/errorHandling.ts";
import { requireCsrfTokenForUser } from "../_shared/csrfProtection.ts";

const ALLOWED_ORIGINS = [
  Deno.env.get("APP_URL"),
  ...(Deno.env.get("ENVIRONMENT") !== "production" ? [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8080",
    "http://localhost:8081",
    "http://localhost:8083",
  ] : []),
  "https://app.kourti.com",
  "https://kouti-legal-hub-41.lovable.app",
]
  .flatMap((value) => (value ? value.split(",") : []))
  .filter(Boolean)
  .map((origin) => {
    if (origin && !origin.startsWith('http://') && !origin.startsWith('https://')) {
      return `https://${origin}`;
    }
    return origin;
  })
  .filter((origin) => origin && (origin.startsWith('http://') || origin.startsWith('https://')));

// Minimum character count below which extracted PDF text is treated as a failed extraction
const PDF_MIN_VIABLE_LENGTH = 50;
// Maximum PDF byte size to attempt OpenAI Vision OCR (20 MB)
const PDF_OCR_MAX_BYTES = 20 * 1024 * 1024;

function getCorsOptions(requestOrigin: string | null): CorsSecurityHeadersOptions {
  const origin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
    ? requestOrigin
    : (ALLOWED_ORIGINS[0] || "https://app.kourti.com");

  return {
    origin,
    requestOrigin,
    allowedOrigins: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : undefined,
    allowCredentials: true,
    allowMethods: ["POST", "OPTIONS"],
  };
}

async function authenticateRequest(req: Request) {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader) {
    throw new HttpError('Authentication required', 401, 'UNAUTHORIZED');
  }

  const token = authHeader.replace('Bearer ', '').trim();

  if (!token) {
    throw new HttpError('Invalid authentication token', 401, 'UNAUTHORIZED');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new HttpError('Server configuration error', 503, 'CONFIG_ERROR');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    console.error('Authentication failed:', authError?.message);
    throw new HttpError('Invalid or expired authentication token', 401, 'UNAUTHORIZED');
  }

  console.log(`Authenticated user: ${user.id}`);

  return { user, supabase };
}

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

serve(async (req: Request) => {
  const requestOrigin = req.headers.get("Origin");
  const corsOptions = getCorsOptions(requestOrigin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return createEmptyResponse({ status: 204, cors: corsOptions });
  }

  try {
    // Authenticate the request
    const { user, supabase } = await authenticateRequest(req);
    console.log(`Processing document extraction for user ${user.id}`);

    // CSRF Protection
    await requireCsrfTokenForUser(supabase, user.id, req);

    // Rate limiting - prevent abuse
    const rateLimitId = user.id;
    const rateLimitResult = checkRateLimit({
      ...RATE_LIMIT_PRESETS.API, // 100 requests per minute
      identifier: rateLimitId,
    });

    if (!rateLimitResult.allowed) {
      const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
      return createJsonResponse(
        {
          success: false,
          error: 'Too many requests. Please try again later.',
          errorCode: 'RATE_LIMIT_EXCEEDED',
        },
        {
          status: 429,
          cors: corsOptions,
          headers: rateLimitHeaders,
        }
      );
    }

    // Parse request body
    let body: any;
    try {
      body = await req.json();
    } catch {
      throw new HttpError('Invalid JSON payload', 400, 'INVALID_JSON');
    }

    const { documentId, filePath } = body ?? {};

    // Validate inputs
    if (!documentId || !isValidUUID(documentId)) {
      throw new HttpError('Valid document ID is required', 400, 'INVALID_INPUT');
    }

    if (!filePath || typeof filePath !== 'string') {
      throw new HttpError('Valid file path is required', 400, 'INVALID_INPUT');
    }

    // Prevent path traversal
    const SAFE_PATH_REGEX = /^[a-zA-Z0-9_\-/.]+$/;
    if (filePath.includes('..') || filePath.startsWith('/') || !SAFE_PATH_REGEX.test(filePath)) {
      throw new HttpError('Invalid file path', 400, 'INVALID_INPUT');
    }

    console.log(`Extracting text from document ${documentId}, file: ${filePath}`);

    // Download the file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(filePath);

    if (downloadError) {
      console.error('Error downloading file:', downloadError);
      throw new HttpError('Failed to download file from storage', 500, 'STORAGE_ERROR');
    }

    if (!fileData) {
      throw new HttpError('No file data received', 404, 'FILE_NOT_FOUND');
    }

    // Determine file type and extract text
    let extractedText = '';
    const fileName = filePath.toLowerCase();
    let extractionError: string | null = null;

    try {
      if (fileName.endsWith('.txt')) {
        // Plain text file
        extractedText = await fileData.text();
        console.log('Extracted text file content, length:', extractedText.length);
      } else if (fileName.endsWith('.pdf')) {
        const arrayBuffer = await fileData.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // Layer 1: pdfjs-serverless (handles compressed streams, font encodings, etc.)
        extractedText = await extractTextFromPDF(uint8Array);
        console.log('Layer 1 (pdfjs-serverless) extracted:', extractedText.length, 'chars');

        // Layer 2: naive regex parser fallback for simple uncompressed PDFs
        if (extractedText.length < PDF_MIN_VIABLE_LENGTH) {
          console.log('Falling back to naive PDF parser...');
          const naiveText = extractTextFromPDFNaive(uint8Array);
          if (naiveText.length > extractedText.length) {
            extractedText = naiveText;
          }
          console.log('Layer 2 (naive) extracted:', extractedText.length, 'chars');
        }

        // Layer 3: OpenAI Vision OCR fallback for scanned/image-based PDFs
        if (extractedText.length < PDF_MIN_VIABLE_LENGTH) {
          const openAiApiKey = Deno.env.get('OPENAI_API_KEY');
          if (openAiApiKey) {
            console.log('Escalating to OpenAI Vision OCR...');
            const ocrText = await extractTextFromPDFWithOCR(uint8Array, filePath, openAiApiKey);
            if (ocrText.length > extractedText.length) {
              extractedText = ocrText;
            }
            console.log('Layer 3 (OCR) extracted:', extractedText.length, 'chars');
          } else {
            console.warn('OPENAI_API_KEY not set - OCR fallback unavailable');
          }
        }

        if (extractedText.length < PDF_MIN_VIABLE_LENGTH) {
          extractionError = 'PDF text extraction yielded limited content. This PDF may contain images or scanned content that requires OCR processing.';
          extractedText = `[PDF document detected: ${filePath}. Text extraction yielded limited content. This PDF may contain images or scanned content that could not be processed.]`;
        }
      } else if (fileName.endsWith('.docx')) {
        // DOCX files are ZIP archives containing XML files
        try {
          const arrayBuffer = await fileData.arrayBuffer();
          extractedText = await extractTextFromDocx(new Uint8Array(arrayBuffer));
          console.log('Extracted DOCX content, length:', extractedText.length);
          
          if (!extractedText || extractedText.length < 10) {
            extractionError = 'DOCX extraction yielded no meaningful content';
            extractedText = `[Unable to extract text from DOCX document automatically.]`;
          }
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          console.error('DOCX extraction error:', errorMsg);
          extractionError = `DOCX extraction failed: ${errorMsg}`;
          extractedText = `[Unable to extract text from DOCX document automatically.]`;
        }
      } else if (fileName.endsWith('.doc')) {
        // Legacy .doc format - very difficult to parse without specialized libraries
        extractionError = 'Legacy .doc format is not supported. Please convert to .docx or .pdf';
        extractedText = `[Legacy DOC format is not supported for automatic text extraction. Please convert to DOCX or PDF format.]`;
      } else {
        // Unknown file type
        extractionError = `Unsupported file type`;
        extractedText = `[File type not supported for automatic text extraction.]`;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('General extraction error:', errorMsg);
      extractionError = `Extraction failed: ${errorMsg}`;
      extractedText = `[Unable to extract text from document automatically.]`;
    }

    // Update the document record with the extracted content
    // Only update if we have meaningful content (not error messages)
    const hasValidContent = extractedText && extractedText.length > 50 && !extractedText.startsWith('[');
    
    if (hasValidContent) {
      const { error: updateError } = await supabase
        .from('documents' as any)
        .update({ 
          content: extractedText,
          updated_at: new Date().toISOString()
        } as any)
        .eq('id', documentId);

      if (updateError) {
        console.error('Error updating document content:', updateError);
        // Log but don't fail - we still return the extracted content
      } else {
        console.log(`Successfully updated document ${documentId} content in database (${extractedText.length} characters)`);
      }
    } else {
      console.warn(`Document ${documentId} extraction did not yield valid content. Length: ${extractedText?.length || 0}, Error: ${extractionError || 'None'}`);
    }

    const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
    return createJsonResponse(
      {
        success: hasValidContent,
        content: extractedText,
        contentLength: extractedText.length,
        documentId,
        error: extractionError || undefined,
        warning: !hasValidContent ? 'Extraction did not yield meaningful content' : undefined
      },
      {
        cors: corsOptions,
        headers: rateLimitHeaders,
      }
    );

  } catch (error: unknown) {
    if (error instanceof HttpError) {
      return createErrorResponse(error, corsOptions);
    }
    return createSanitizedErrorResponse(error, corsOptions, {
      function: 'extract-document-text',
    });
  }
});

/**
 * Extract text from PDF using pdfjs-serverless.
 * Handles FlateDecode compressed streams, CIDFonts, ToUnicode CMaps,
 * and all standard font encodings.
 */
async function extractTextFromPDF(data: Uint8Array): Promise<string> {
  try {
    const loadingTask = getDocument({
      data,
      disableFontFace: true,
      useSystemFonts: false,
    });

    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    console.log(`PDF loaded with pdfjs-serverless: ${numPages} pages`);

    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      const pageText = textContent.items
        .filter((item: any) => 'str' in item)
        .map((item: any) => item.str)
        .join(' ')
        .replace(/[ \t]+/g, ' ')
        .trim();

      if (pageText) {
        pageTexts.push(pageText);
      }

      page.cleanup();
    }

    const fullText = pageTexts.join('\n\n').trim();
    console.log(`pdfjs-serverless extraction complete: ${fullText.length} characters`);
    return fullText;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('pdfjs-serverless extraction error:', msg);
    return '';
  }
}

/**
 * Fallback: naive PDF text extraction by parsing raw PDF streams.
 * Works for simple uncompressed PDFs only.
 */
function extractTextFromPDFNaive(data: Uint8Array): string {
  const text: string[] = [];
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const content = decoder.decode(data);

  const btPattern = /BT\s*([\s\S]*?)\s*ET/g;
  let match;

  while ((match = btPattern.exec(content)) !== null) {
    const textBlock = match[1];

    const tjPattern = /\((.*?)\)\s*Tj/g;
    const tjArrayPattern = /\[(.*?)\]\s*TJ/g;

    let tjMatch;
    while ((tjMatch = tjPattern.exec(textBlock)) !== null) {
      const extracted = decodeEscapedText(tjMatch[1]);
      if (extracted.trim()) {
        text.push(extracted);
      }
    }

    while ((tjMatch = tjArrayPattern.exec(textBlock)) !== null) {
      const arrayContent = tjMatch[1];
      const stringPattern = /\((.*?)\)/g;
      let stringMatch;
      while ((stringMatch = stringPattern.exec(arrayContent)) !== null) {
        const extracted = decodeEscapedText(stringMatch[1]);
        if (extracted.trim()) {
          text.push(extracted);
        }
      }
    }
  }

  const streamPattern = /stream\s*([\s\S]*?)\s*endstream/g;
  while ((match = streamPattern.exec(content)) !== null) {
    const streamContent = match[1];
    const readableText = streamContent.match(/[\x20-\x7E]{20,}/g);
    if (readableText) {
      text.push(...readableText.filter(segment => !segment.includes('/') && !segment.includes('<<')));
    }
  }

  const result = text
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E\n]/g, '')
    .trim();

  return result;
}

function decodeEscapedText(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\')
    .replace(/\\([0-7]{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\(.)/g, '$1');
}

/**
 * Layer 3 OCR fallback using OpenAI Vision API for scanned/image-based PDFs.
 * Only called when all text-based extraction layers yield fewer than PDF_MIN_VIABLE_LENGTH characters.
 */
async function extractTextFromPDFWithOCR(
  data: Uint8Array,
  filePath: string,
  apiKey: string
): Promise<string> {
  if (data.length > PDF_OCR_MAX_BYTES) {
    console.warn(`PDF too large for OCR (${data.length} bytes), skipping`);
    return '';
  }

  try {
    console.log('Attempting OpenAI Vision OCR fallback for:', filePath);

    // Convert to base64 in chunks to avoid call stack overflow on large files
    let binaryString = '';
    const chunkSize = 8192;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.subarray(i, Math.min(i + chunkSize, data.length));
      binaryString += String.fromCharCode(...chunk);
    }
    const base64Pdf = btoa(binaryString);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract all text content from this PDF document. Return only the raw text, preserving paragraph structure with newlines. Do not add commentary or formatting.',
              },
              {
                type: 'file',
                file: {
                  filename: filePath.split('/').pop() || 'document.pdf',
                  file_data: `data:application/pdf;base64,${base64Pdf}`,
                },
              },
            ],
          },
        ],
        max_tokens: 4096,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI OCR error:', errorText);
      return '';
    }

    const result = await response.json();
    const extractedText = result.choices?.[0]?.message?.content || '';
    console.log(`OCR extraction complete: ${extractedText.length} characters`);
    return extractedText.trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('OCR fallback failed:', msg);
    return '';
  }
}

/**
 * DOCX text extraction
 * DOCX files are ZIP archives containing XML files
 * We need to unzip and read word/document.xml
 */
async function extractTextFromDocx(data: Uint8Array): Promise<string> {
  try {
    // Load the DOCX file as a ZIP archive using JSZip
    const zip = await JSZip.loadAsync(data);
    
    // Get the main document XML file
    const documentXml = zip.file('word/document.xml');
    
    if (!documentXml) {
      throw new Error('word/document.xml not found in DOCX archive');
    }
    
    // Read the document XML content as text
    const xmlText = await documentXml.async('string');
    
    // Extract text from XML using regex
    const text: string[] = [];
    
    // Look for text content in <w:t> tags (Word's text elements)
    // Use global flag and handle multiline content
    const textPattern = /<w:t[^>]*>(.*?)<\/w:t>/gs;
    let match;
    
    while ((match = textPattern.exec(xmlText)) !== null) {
      const textContent = match[1];
      // Decode XML entities
      const decoded = textContent
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      
      if (decoded.trim()) {
        text.push(decoded);
      }
    }
    
    // If no text found with the standard pattern, try a more aggressive approach
    if (text.length === 0) {
      // Look for any text between tags, but be more selective
      const fallbackPattern = />([^<]{3,})</g;
      while ((match = fallbackPattern.exec(xmlText)) !== null) {
        const potential = match[1].trim();
        // Filter out XML tags, attributes, and other non-text content
        if (potential && 
            !potential.startsWith('?') &&
            !potential.startsWith('!') &&
            !potential.includes('xmlns') &&
            !potential.match(/^[a-z]+:/i) &&
            !potential.match(/^[A-Z][a-z]+:/) && // Filter namespace prefixes
            potential.match(/[A-Za-z]/)) { // Must contain at least one letter
          text.push(potential);
        }
      }
    }
    
    const result = text.join(' ')
      .replace(/\s+/g, ' ')
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
      .trim();
    
    if (result.length < 10) {
      throw new Error('Extracted text is too short, likely extraction failed');
    }
    
    return result;
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('DOCX extraction error:', errorMsg);
    
    // Fallback: try to extract any readable text from the raw data
    try {
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const content = decoder.decode(data);
      
      // Look for any readable text sequences (this is a last resort)
      const readablePattern = /[A-Za-z0-9\s.,;:!?\-'"]{30,}/g;
      const matches = content.match(readablePattern);
      
      if (matches && matches.length > 0) {
        const fallbackText = matches.join(' ').substring(0, 10000); // Limit to 10k chars
        if (fallbackText.length > 50) {
          console.log('Using fallback text extraction, length:', fallbackText.length);
          return fallbackText;
        }
      }
    } catch (fallbackError) {
      console.error('Fallback extraction also failed:', fallbackError);
    }
    
    throw new Error(`Failed to extract DOCX content: ${errorMsg}`);
  }
}
