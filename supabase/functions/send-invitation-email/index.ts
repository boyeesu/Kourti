// @ts-ignore: Deno module
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore: Deno module
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createEmptyResponse, createJsonResponse, CorsSecurityHeadersOptions } from "../_shared/responseHeaders.ts";
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMIT_PRESETS, createRateLimitHeaders } from "../_shared/rateLimiting.ts";
import { createErrorResponse } from "../_shared/errorHandling.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const fromEmail = Deno.env.get("SMTP_FROM_EMAIL") || "onboarding@resend.dev";

const ALLOWED_ORIGINS = [
  Deno.env.get("APP_URL"),
  ...(Deno.env.get("ENVIRONMENT") !== "production" ? [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8080",
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

interface SsoLink {
  provider: 'google' | 'microsoft';
  url: string;
  mode: 'supabase_managed' | 'federated';
}

interface InvitationEmailRequest {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  department?: string;
  organizationName: string;
  inviterName: string;
  invitationUrl: string;
  tempPassword?: string; // New: temporary password for direct login
  ssoEnforced?: boolean;
  ssoLinks?: SsoLink[];
}

const handler = async (req: Request): Promise<Response> => {
  console.log("send-invitation-email function invoked");

  const requestOrigin = req.headers.get("Origin");
  const corsOptions = getCorsOptions(requestOrigin);

  if (req.method === 'OPTIONS') {
    return createEmptyResponse({ status: 204, cors: corsOptions });
  }

  // Rate limiting - prevent email spam
  const rateLimitId = getRateLimitIdentifier(req);
  const rateLimitResult = checkRateLimit({
    ...RATE_LIMIT_PRESETS.EMAIL,
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
      tempPassword,
      ssoEnforced = false,
      ssoLinks = [],
    }: InvitationEmailRequest = await req.json();

    console.log('Processing invitation email for:', email);
    console.log('Has temp password:', !!tempPassword);
    console.log('SSO enforced:', ssoEnforced, 'SSO links:', ssoLinks.length);

    // Generate the login URL (not signup - user already created)
    const origin = new URL(invitationUrl).origin;
    const loginUrl = tempPassword 
      ? `${origin}/auth?email=${encodeURIComponent(email)}&invited=true`
      : `${origin}/auth?email=${encodeURIComponent(email)}&invited=true`;

    console.log('Login URL:', loginUrl);

    const htmlContent = tempPassword
      ? buildTempPasswordEmailHtml({
          firstName,
          lastName,
          role,
          department,
          organizationName,
          inviterName,
          loginUrl,
          tempPassword,
          email,
        })
      : buildInvitationEmailHtml({
          firstName,
          lastName,
          role,
          department,
          organizationName,
          inviterName,
          signupUrl: loginUrl,
          ssoEnforced,
          ssoLinks,
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

    const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
    return createJsonResponse(
      {
        success: true,
        message: 'Invitation email sent successfully',
        messageId: data?.id,
      },
      {
        status: 200,
        cors: corsOptions,
        headers: rateLimitHeaders,
      }
    );

  } catch (error: unknown) {
    return createErrorResponse(error, corsOptions, {
      function: 'send-invitation-email',
    });
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
  ssoEnforced: boolean;
  ssoLinks: SsoLink[];
}

interface TempPasswordEmailParams {
  firstName: string;
  lastName: string;
  role: string;
  department?: string;
  organizationName: string;
  inviterName: string;
  loginUrl: string;
  tempPassword: string;
  email: string;
}

function buildTempPasswordEmailHtml(params: TempPasswordEmailParams): string {
  const { firstName, lastName, role, department, organizationName, inviterName, loginUrl, tempPassword, email } = params;
  
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
                Your account has been created! Use the credentials below to log in:
              </p>
              
              <!-- Credentials Box -->
              <table cellpadding="0" cellspacing="0" style="margin: 25px 0; width: 100%; background-color: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
                <tr>
                  <td style="padding: 20px;">
                    <table cellpadding="0" cellspacing="0" style="width: 100%;">
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="color: #666666; font-size: 14px; font-weight: 500;">Email:</span>
                          <span style="color: #1a365d; font-size: 16px; font-weight: 600; margin-left: 10px;">${email}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-top: 1px solid #e9ecef;">
                          <span style="color: #666666; font-size: 14px; font-weight: 500;">Temporary Password:</span>
                          <span style="color: #1a365d; font-size: 16px; font-weight: 600; font-family: monospace; background-color: #e9ecef; padding: 4px 8px; border-radius: 4px; margin-left: 10px;">${tempPassword}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <p style="color: #dc2626; font-size: 14px; margin: 15px 0; padding: 12px; background-color: #fef2f2; border-radius: 6px; border-left: 4px solid #dc2626;">
                ⚠️ <strong>Important:</strong> You will be required to change your password after your first login.
              </p>
              
              <table cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); border-radius: 8px; box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);">
                    <a href="${loginUrl}" style="display: inline-block; padding: 16px 36px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">
                      Sign In
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="color: #888888; font-size: 13px; margin: 25px 0 0;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${loginUrl}" style="color: #1a365d; word-break: break-all;">${loginUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 25px 30px; border-radius: 0 0 12px 12px; border-top: 1px solid #e9ecef;">
              <p style="color: #999999; font-size: 13px; margin: 0; text-align: center;">
                This invitation was sent by ${organizationName}.<br>
                If you didn't expect this email, please contact your administrator.
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

function buildInvitationEmailHtml(params: InvitationEmailHtmlParams): string {
  const { firstName, lastName, role, department, organizationName, inviterName, signupUrl, ssoEnforced, ssoLinks } = params;
  
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'there';
  const roleDisplay = role.charAt(0).toUpperCase() + role.slice(1);
  const departmentLine = department ? `<p style="color: #666666; font-size: 14px; margin: 8px 0 0;">Department: ${department}</p>` : '';
  
  // Build SSO buttons HTML
  let ssoButtonsHtml = '';
  if (ssoLinks.length > 0) {
    const ssoButtons = ssoLinks.map(link => {
      const providerName = link.provider === 'google' ? 'Google' : 'Microsoft';
      const providerColor = link.provider === 'google' ? '#4285F4' : '#00A4EF';
      
      return `
        <tr>
          <td style="padding: 8px 0;">
            <a href="${link.url}" style="display: inline-block; width: 100%; padding: 12px 24px; background-color: ${providerColor}; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              Sign in with ${providerName}
            </a>
          </td>
        </tr>
      `;
    }).join('');
    
    ssoButtonsHtml = `
      <table cellpadding="0" cellspacing="0" style="margin: 20px 0; width: 100%;">
        ${ssoButtons}
      </table>
    `;
  }
  
  // Build main CTA section
  let mainCtaHtml = '';
  if (ssoEnforced && ssoLinks.length > 0) {
    // SSO is enforced - only show SSO buttons
    mainCtaHtml = `
      <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 25px 0;">
        ${ssoLinks.length === 1 
          ? 'Please sign in using your organization account:'
          : 'Please sign in using one of your organization accounts:'}
      </p>
      ${ssoButtonsHtml}
    `;
  } else if (ssoLinks.length > 0) {
    // SSO available but not enforced - show both options
    mainCtaHtml = `
      <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 25px 0;">
        You can sign in using your organization account or create a new account:
      </p>
      ${ssoButtonsHtml}
      <div style="text-align: center; margin: 20px 0; color: #999999; font-size: 14px;">or</div>
      <table cellpadding="0" cellspacing="0" style="margin: 20px 0;">
        <tr>
          <td style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); border-radius: 8px; box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);">
            <a href="${signupUrl}" style="display: inline-block; padding: 16px 36px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">
              Create Account with Email
            </a>
          </td>
        </tr>
      </table>
    `;
  } else {
    // No SSO - show regular signup button
    mainCtaHtml = `
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
    `;
  }
  
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
              ${mainCtaHtml}
              ${!ssoEnforced ? `
              <p style="color: #888888; font-size: 13px; margin: 25px 0 0;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${signupUrl}" style="color: #1a365d; word-break: break-all;">${signupUrl}</a>
              </p>
              ` : ''}
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
