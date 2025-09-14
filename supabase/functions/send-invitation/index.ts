import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InvitationRequest {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  department?: string;
  organizationName?: string;
  inviterName?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      email,
      firstName,
      lastName,
      role,
      department,
      organizationName = 'Organization',
      inviterName = 'Admin'
    }: InvitationRequest = await req.json();

    console.log('Processing invitation for:', email);

    // For now, just log the invitation details
    // In a real implementation, you would integrate with your email service
    console.log('Invitation details:', {
      email,
      firstName,
      lastName,
      role,
      department,
      organizationName,
      inviterName
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Invitation processed successfully',
        note: 'Email integration to be implemented'
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error('Error in send-invitation function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
};

serve(handler);