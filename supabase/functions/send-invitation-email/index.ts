import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

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
  ssoEnforced?: boolean;
  ssoLinks?: Array<{ provider: string; url: string; mode?: string }>;
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
      ssoEnforced = false,
      ssoLinks = [],
    }: InvitationEmailRequest = await req.json();

    console.log('Sending invitation email to:', email);

    let safeInvitationUrl = invitationUrl;
    try {
      safeInvitationUrl = new URL(invitationUrl).toString();
    } catch (_err) {
      console.warn('Invalid invitation URL provided, falling back to default /auth path');
      const baseUrl = new URL('/auth', req.headers.get('origin') ?? 'https://example.com');
      safeInvitationUrl = baseUrl.toString();
    }

    const hasSsoLinks = Array.isArray(ssoLinks) && ssoLinks.length > 0;
    const ssoSection = (hasSsoLinks || ssoEnforced)
      ? `
              <div style="margin-top: 24px; padding: 16px; border-radius: 8px; border: 1px solid #d0d7ff; background: #f3f5ff;">
                <h3 style="margin: 0 0 8px 0; color: #3b49df; font-size: 16px;">
                  Single Sign-On ${ssoEnforced ? '(Required)' : ''}
                </h3>
                <p style="margin: 0 0 12px 0; color: #4b5563;">
                  ${ssoEnforced
                    ? 'Your organization requires you to authenticate with an approved identity provider. Use one of the links below to launch the secure login flow.'
                    : 'You can also sign in using your organization\'s identity provider:'}
                </p>
                ${hasSsoLinks
                  ? ssoLinks.map((link) => `
                    <p style="margin: 0 0 8px 0;">
                      <a href="${link.url}" style="display: inline-block; background: #3b49df; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;">
                        Continue with ${link.provider.charAt(0).toUpperCase()}${link.provider.slice(1)}
                      </a>
                    </p>
                  `).join('')
                  : `<p style="margin: 0; color: #4b5563;">If you don\'t see a button here, please contact your administrator for the correct SSO link.</p>`}
              </div>
        `
      : '';

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Invitation to Join ${organizationName}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f8f9fa; padding: 30px; }
            .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { background: #e9ecef; padding: 20px; text-align: center; font-size: 14px; color: #6c757d; border-radius: 0 0 8px 8px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>You're Invited!</h1>
              <p>Join ${organizationName} as a ${role}</p>
            </div>
            
            <div class="content">
              <h2>Hello ${firstName} ${lastName},</h2>
              
              <p><strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> with the role of <strong>${role}</strong>.</p>
              
              ${department ? `<p>You'll be working in the <strong>${department}</strong> department.</p>` : ''}
              
              <p>To accept this invitation and create your account, click the button below:</p>

              <a href="${safeInvitationUrl}" class="button">
                Accept Invitation & Sign Up
              </a>

              <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #667eea;">
                ${safeInvitationUrl}
              </p>

              ${ssoSection}

              <p>This invitation will expire in 14 days.</p>

              <p>If you have any questions, please contact ${inviterName} or your system administrator.</p>
            </div>
            
            <div class="footer">
              <p>This is an automated message from ${organizationName}.</p>
              <p>If you didn't expect this invitation, please ignore this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const emailResponse = await resend.emails.send({
      from: `Kourti Legal <noreply@resend.dev>`,
      to: [email],
      subject: `Invitation to join ${organizationName} as ${role}`,
      html: emailHtml,
    });

    if (emailResponse.error) {
      console.error('Error sending invitation email with Resend:', emailResponse.error);
      return new Response(
        JSON.stringify({
          error: 'Failed to send invitation email',
          details: emailResponse.error.message ?? emailResponse.error,
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    const emailId = emailResponse.data?.id;

    if (!emailId) {
      console.error('Resend response missing email ID for invitation email:', emailResponse);
      return new Response(
        JSON.stringify({ error: 'Failed to send invitation email' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    console.log('Email sent successfully:', emailId);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Invitation email sent successfully',
        emailId,
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