import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId, filePath } = await req.json();

    if (!documentId || !filePath) {
      return new Response(
        JSON.stringify({ error: 'documentId and filePath are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Extracting text from document ${documentId}, file: ${filePath}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Download the file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(filePath);

    if (downloadError) {
      console.error('Error downloading file:', downloadError);
      return new Response(
        JSON.stringify({ error: `Failed to download file: ${downloadError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!fileData) {
      return new Response(
        JSON.stringify({ error: 'No file data received' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine file type and extract text
    let extractedText = '';
    const fileName = filePath.toLowerCase();

    if (fileName.endsWith('.txt')) {
      // Plain text file
      extractedText = await fileData.text();
      console.log('Extracted text file content, length:', extractedText.length);
    } else if (fileName.endsWith('.pdf')) {
      // For PDF files, we'll use a basic text extraction approach
      // Convert blob to ArrayBuffer
      const arrayBuffer = await fileData.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Try to extract text from PDF using basic stream parsing
      extractedText = extractTextFromPDF(uint8Array);
      console.log('Extracted PDF content, length:', extractedText.length);
      
      if (!extractedText || extractedText.length < 50) {
        // If basic extraction fails, return a message indicating OCR may be needed
        extractedText = `[PDF document detected: ${filePath}. Basic text extraction yielded limited content. This PDF may contain images or scanned content that requires OCR processing.]`;
      }
    } else if (fileName.endsWith('.doc') || fileName.endsWith('.docx')) {
      // For Word documents, try basic text extraction
      try {
        const arrayBuffer = await fileData.arrayBuffer();
        extractedText = extractTextFromDocx(new Uint8Array(arrayBuffer));
        console.log('Extracted Word document content, length:', extractedText.length);
      } catch (e) {
        console.error('Word extraction error:', e);
        extractedText = `[Word document detected: ${filePath}. Unable to extract text content automatically.]`;
      }
    } else {
      // Unknown file type
      extractedText = `[File type not supported for automatic text extraction: ${filePath}]`;
    }

    // Update the document record with the extracted content
    if (extractedText && extractedText.length > 50 && !extractedText.startsWith('[')) {
      const { error: updateError } = await supabase
        .from('documents')
        .update({ 
          content: extractedText,
          updated_at: new Date().toISOString()
        })
        .eq('id', documentId);

      if (updateError) {
        console.error('Error updating document content:', updateError);
        // Don't fail the request, still return the extracted content
      } else {
        console.log('Successfully updated document content in database');
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        content: extractedText,
        contentLength: extractedText.length,
        documentId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Extract document text error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Basic PDF text extraction by parsing PDF streams
 * This is a simplified extraction that works for many PDFs with embedded text
 */
function extractTextFromPDF(data: Uint8Array): string {
  const text: string[] = [];
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const content = decoder.decode(data);
  
  // Look for text between BT (Begin Text) and ET (End Text) markers
  const btPattern = /BT\s*([\s\S]*?)\s*ET/g;
  let match;
  
  while ((match = btPattern.exec(content)) !== null) {
    const textBlock = match[1];
    
    // Extract text from Tj and TJ operators
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
  
  // Also try to find text in stream objects
  const streamPattern = /stream\s*([\s\S]*?)\s*endstream/g;
  while ((match = streamPattern.exec(content)) !== null) {
    const streamContent = match[1];
    // Look for readable ASCII text sequences
    const readableText = streamContent.match(/[\x20-\x7E]{20,}/g);
    if (readableText) {
      text.push(...readableText.filter(t => !t.includes('/') && !t.includes('<<')));
    }
  }
  
  // Clean up and join the text
  const result = text
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E\n]/g, '')
    .trim();
    
  return result;
}

/**
 * Decode escaped characters in PDF text strings
 */
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
 * Basic DOCX text extraction
 * DOCX files are ZIP archives containing XML files
 */
function extractTextFromDocx(data: Uint8Array): string {
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const content = decoder.decode(data);
  
  // Look for text content in the XML
  const textPattern = /<w:t[^>]*>(.*?)<\/w:t>/g;
  const text: string[] = [];
  let match;
  
  while ((match = textPattern.exec(content)) !== null) {
    if (match[1].trim()) {
      text.push(match[1]);
    }
  }
  
  // Also try to find plain text content
  const plainTextPattern = />([^<]{10,})</g;
  while ((match = plainTextPattern.exec(content)) !== null) {
    const potential = match[1].trim();
    if (potential && !potential.includes('=') && !potential.startsWith('http')) {
      text.push(potential);
    }
  }
  
  return text.join(' ').replace(/\s+/g, ' ').trim();
}
