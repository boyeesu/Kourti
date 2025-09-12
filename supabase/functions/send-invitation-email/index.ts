import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InvitationEmailRequest {
  email: string;
  firstName: string;
  role: string;
  organizationName: string;
  inviterName: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      email, 
      firstName, 
      role, 
      organizationName, 
      inviterName 
    }: InvitationEmailRequest = await req.json();

    const emailResponse = await resend.emails.send({
      from: "Legal Manager <noreply@resend.dev>",
      to: [email],
      subject: `You're invited to join ${organizationName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Join ${organizationName}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { text-align: center; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: bold; color: #333; margin-bottom: 10px; }
            .content { color: #333; }
            .role-badge { background: #e3f2fd; color: #1976d2; padding: 4px 12px; border-radius: 20px; font-size: 14px; display: inline-block; margin: 10px 0; }
            .cta-button { display: inline-block; background: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">⚖️ Legal Manager</div>
              <h1>You're invited to join ${organizationName}</h1>
            </div>
            
            <div class="content">
              <p>Hi ${firstName},</p>
              
              <p><strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> as a <span class="role-badge">${role}</span> on Legal Manager.</p>
              
              <p>Legal Manager is a comprehensive legal case management platform that helps law firms and legal departments:</p>
              
              <ul>
                <li>📋 Manage cases and client information</li>
                <li>📄 Handle documents and contracts</li>
                <li>📅 Track important dates and deadlines</li>
                <li>💰 Generate and manage invoices</li>
                <li>👥 Collaborate with team members</li>
              </ul>
              
              <p>To get started, simply create your account and you'll be automatically added to ${organizationName}:</p>
              
              <div style="text-align: center;">
                <a href="${Deno.env.get("SITE_URL") || "https://legal-manager.lovable.app"}/auth" class="cta-button">
                  Accept Invitation & Sign Up
                </a>
              </div>
              
              <p><strong>Your role:</strong> ${role}<br>
                 <strong>Organization:</strong> ${organizationName}</p>
              
              <p>If you have any questions, feel free to reply to this email or contact ${inviterName} directly.</p>
              
              <p>Welcome to the team!</p>
            </div>
            
            <div class="footer">
              <p>This invitation was sent by ${inviterName} from ${organizationName}.</p>
              <p>If you didn't expect this invitation, you can safely ignore this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Invitation email sent successfully:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-invitation-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);