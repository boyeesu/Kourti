import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore: Deno module
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
  console.log("send-invitation-email function invoked");

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
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

    console.log('Processing invitation email for:', email);

    // Create Supabase admin client to invite user
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Generate the redirect URL for password setup
    const origin = new URL(invitationUrl).origin;
    const redirectUrl = `${origin}/auth/set-password`;

    console.log('Sending invite with redirect to:', redirectUrl);

    // Use Supabase's invite functionality - this sends an email with a magic link
    // that will redirect to /auth/set-password with the proper auth tokens
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectUrl,
      data: {
        first_name: firstName,
        last_name: lastName,
        role: role,
        department: department,
        organization_name: organizationName,
        inviter_name: inviterName,
      }
    });

    if (inviteError) {
      console.error("Supabase invite error:", inviteError);
      
      // If user already exists, provide helpful message
      if (inviteError.message?.includes('already been registered') || 
          inviteError.message?.includes('already exists')) {
        throw new Error('This user has already been invited or registered. They can sign in with their existing credentials.');
      }
      
      throw new Error(`Failed to create invitation: ${inviteError.message}`);
    }

    console.log('Supabase invitation sent successfully:', {
      userId: inviteData?.user?.id,
      email: inviteData?.user?.email,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Invitation email sent successfully',
        userId: inviteData?.user?.id,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error('Error in send-invitation-email function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
