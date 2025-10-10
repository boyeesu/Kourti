import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore - Deno runtime import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InvitationEmailRequest {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  department?: string;
  organizationName: string;
  inviterName: string;
  invitationUrl: string;
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
      organizationName,
      inviterName,
      invitationUrl,
    }: InvitationEmailRequest = await req.json();

    console.log('Sending invitation email to:', email);

    // Get the origin from the request or use a fallback
    const origin = req.headers.get('origin') || supabaseUrl.replace(/\/$/, '');
    
    // Construct the redirect URL - redirect to password setup page for invited users
    let redirectUrl = invitationUrl;
    try {
      const parsedUrl = new URL(invitationUrl);
      // Use the origin from invitation URL but redirect to password setup
      redirectUrl = `${parsedUrl.origin}/auth/set-password`;
    } catch (_err) {
      console.warn('Invalid invitation URL provided, using origin/auth/set-password');
      redirectUrl = `${origin}/auth/set-password`;
    }

    console.log('Using redirect URL:', redirectUrl);

    // Use Supabase's built-in invite user by email functionality
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          first_name: firstName,
          last_name: lastName,
          role: role,
          department: department || null,
          organization: organizationName,
          invited_by: inviterName,
        },
        redirectTo: redirectUrl,
      }
    );

    if (inviteError) {
      console.error('Error sending invitation email via Supabase:', inviteError);
      return new Response(
        JSON.stringify({
          error: 'Failed to send invitation email',
          details: inviteError.message,
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    console.log('Invitation sent successfully via Supabase Auth:', inviteData);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Invitation email sent successfully via Supabase Auth',
        user: inviteData.user,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error('Error in send-invitation-email function:', error);
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