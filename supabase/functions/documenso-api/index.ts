import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  const allowedOrigins = Deno.env.get('TRUSTED_ORIGINS')?.split(',') ?? [];
  if (!allowedOrigins.includes(origin)) {
    return new Response(
      JSON.stringify({ error: 'Origin not allowed' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!authHeader?.startsWith('Bearer ') || !supabaseUrl || !supabaseAnonKey) {
    return new Response(
      JSON.stringify({ error: 'Missing or invalid authorization token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const token = authHeader.replace('Bearer ', '');
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': supabaseAnonKey,
    },
  });

  if (!userResponse.ok) {
    return new Response(
      JSON.stringify({ error: 'Invalid auth token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const documensoUrl = Deno.env.get('VITE_DOCUMENSO_URL');
    const documensoApiKey = Deno.env.get('VITE_DOCUMENSO_API_KEY');
    
    if (!documensoUrl || !documensoApiKey) {
      throw new Error('Documenso configuration not found');
    }

    const { action, documentId, recipient, recipientId, file } = await req.json();

    console.log(`Processing Documenso action: ${action}`);

    switch (action) {
      case 'upload':
        if (!file) {
          throw new Error('File data is required for upload');
        }
        
        // Convert base64 to blob for upload
        const fileData = new Uint8Array(atob(file.data).split('').map(c => c.charCodeAt(0)));
        const formData = new FormData();
        formData.append('file', new Blob([fileData], { type: file.type }), file.name);

        const uploadResponse = await fetch(`${documensoUrl}/documents`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${documensoApiKey}`,
          },
          body: formData,
        });

        if (!uploadResponse.ok) {
          const error = await uploadResponse.text();
          throw new Error(`Documenso upload failed: ${error}`);
        }

        const uploadResult = await uploadResponse.json();
        return new Response(
          JSON.stringify(uploadResult),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      case 'addSigner':
        if (!documentId || !recipient) {
          throw new Error('Document ID and recipient are required');
        }

        const signerResponse = await fetch(`${documensoUrl}/documents/${documentId}/signers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${documensoApiKey}`,
          },
          body: JSON.stringify(recipient),
        });

        if (!signerResponse.ok) {
          const error = await signerResponse.text();
          throw new Error(`Documenso add signer failed: ${error}`);
        }

        const signerResult = await signerResponse.json();
        return new Response(
          JSON.stringify(signerResult),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      case 'getSigningUrl':
        if (!documentId || !recipientId) {
          throw new Error('Document ID and recipient ID are required');
        }

        const urlResponse = await fetch(
          `${documensoUrl}/documents/${documentId}/signers/${recipientId}/sign-url`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${documensoApiKey}`,
            },
          }
        );

        if (!urlResponse.ok) {
          const error = await urlResponse.text();
          throw new Error(`Documenso get signing URL failed: ${error}`);
        }

        const urlResult = await urlResponse.json();
        return new Response(
          JSON.stringify(urlResult),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      default:
        throw new Error(`Invalid action: ${action}`);
    }

  } catch (error) {
    console.error('Error in documenso-api function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});