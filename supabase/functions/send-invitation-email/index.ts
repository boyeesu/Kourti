import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore: Deno module
import { Resend } from "npm:resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const fromEmail = Deno.env.get("SMTP_FROM_EMAIL") || "noreply@resend.dev";

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

    // Generate the signup URL that directs to register page with email pre-filled
    const origin = new URL(invitationUrl).origin;
    const signupUrl = `${origin}/auth?email=${encodeURIComponent(email)}&invited=true`;

    console.log('Signup URL:', signupUrl);

    const htmlContent = buildInvitationEmailHtml({
      firstName,
      lastName,
      role,
      department,
      organizationName,
      inviterName,
      signupUrl,
    });

    const emailSubject = `You're invited to join ${organizationName}`;

    console.log("Sending invitation email via Resend:", { to: email, subject: emailSubject });

    const { data, error } = await resend.emails.send({
      from: `${organizationName} <${fromEmail}>`,
      to: [email],
      subject: emailSubject,
      html: htmlContent,
    });

    if (error) {
      console.error("Resend error:", error);
      throw new Error(error.message);
    }

    console.log("Invitation email sent successfully:", data?.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Invitation email sent successfully',
        messageId: data?.id,
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

interface InvitationEmailHtmlParams {
  firstName: string;
  lastName: string;
  role: string;
  department?: string;
  organizationName: string;
  inviterName: string;
  signupUrl: string;
}

function buildInvitationEmailHtml(params: InvitationEmailHtmlParams): string {
  const { firstName, lastName, role, department, organizationName, inviterName, signupUrl } = params;
  
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'there';
  const roleDisplay = role.charAt(0).toUpperCase() + role.slice(1);
  const departmentLine = department ? `<p style="color: #666666; font-size: 14px; margin: 8px 0 0;">Department: ${department}</p>` : '';
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation to ${organizationName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #1a365d 0%, #2d4a7c 100%); padding: 40px 30px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">
                🎉 You're Invited!
              </h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 16px;">
                Join ${organizationName}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #333333; font-size: 18px; margin: 0 0 20px;">
                Hello ${fullName},
              </p>
              <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0 0 25px;">
                <strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> as a <strong>${roleDisplay}</strong>.
              </p>
              ${departmentLine}
              <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 25px 0;">
                Click the button below to create your account and set your password:
              </p>
              <table cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); border-radius: 8px; box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);">
                    <a href="${signupUrl}" style="display: inline-block; padding: 16px 36px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color: #888888; font-size: 13px; margin: 25px 0 0;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${signupUrl}" style="color: #1a365d; word-break: break-all;">${signupUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 25px 30px; border-radius: 0 0 12px 12px; border-top: 1px solid #e9ecef;">
              <p style="color: #999999; font-size: 13px; margin: 0; text-align: center;">
                This invitation was sent by ${organizationName}.<br>
                If you didn't expect this email, you can safely ignore it.
              </p>
              <p style="color: #aaaaaa; font-size: 12px; margin: 15px 0 0; text-align: center;">
                © ${new Date().getFullYear()} ${organizationName}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

serve(handler);
