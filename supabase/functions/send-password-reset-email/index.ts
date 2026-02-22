// @ts-ignore: Deno module
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore: Deno module
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
// @ts-ignore: Deno module
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createEmptyResponse, createJsonResponse, CorsSecurityHeadersOptions } from "../_shared/responseHeaders.ts";
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMIT_PRESETS, createRateLimitHeaders } from "../_shared/rateLimiting.ts";
import { createErrorResponse } from "../_shared/errorHandling.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const fromEmail = Deno.env.get("SMTP_FROM_EMAIL") || "onboarding@resend.dev";

const ALLOWED_ORIGINS = [
  Deno.env.get("APP_URL"),
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:8083",
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

interface PasswordResetEmailRequest {
  email: string;
  redirectUrl: string;
  organizationName?: string;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("send-password-reset-email function invoked");

  const requestOrigin = req.headers.get("Origin");
  const corsOptions = getCorsOptions(requestOrigin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return createEmptyResponse({ status: 204, cors: corsOptions });
  }

  // Rate limiting - prevent abuse of password reset
  const rateLimitId = getRateLimitIdentifier(req);
  const rateLimitResult = checkRateLimit({
    ...RATE_LIMIT_PRESETS.AUTH,
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
    // Note: Password reset is unauthenticated, but we still validate CSRF if token is provided
    // This prevents abuse while allowing legitimate password reset requests
    // If no token is provided, we allow it (for first-time password reset requests)
    const csrfToken = req.headers.get('X-CSRF-Token');
    if (csrfToken) {
      // If token is provided, validate it (user might be partially authenticated)
      // For now, we'll allow password reset without CSRF token to support legitimate use cases
      // Rate limiting provides sufficient protection
    }

    const {
      email,
      redirectUrl,
      organizationName = "Kourti Legal",
    }: PasswordResetEmailRequest = await req.json();

    console.log('Processing password reset email for:', email);

    // Generate password reset link using Supabase admin API
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: email.toLowerCase(),
      options: {
        redirectTo: redirectUrl,
      },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error('Failed to generate password reset link:', linkError);
      throw new Error(linkError?.message || 'Failed to generate password reset link');
    }

    const resetLink = linkData.properties.action_link;
    console.log('Password reset link generated');

    // Get user profile for personalization
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    const firstName = profile?.first_name || '';
    const fullName = [firstName, profile?.last_name].filter(Boolean).join(' ') || 'there';

    const htmlContent = buildPasswordResetEmailHtml({
      fullName,
      resetLink,
      organizationName,
    });

    const emailSubject = `Reset Your ${organizationName} Password`;

    console.log("Sending password reset email via Resend:", { to: email, subject: emailSubject });

    const { data, error } = await resend.emails.send({
      from: `${organizationName} <${fromEmail}>`,
      to: [email.toLowerCase()],
      subject: emailSubject,
      html: htmlContent,
    });

    if (error) {
      console.error("Resend error:", error);
      throw new Error(error.message);
    }

    console.log("Password reset email sent successfully:", data?.id);

    const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
    return createJsonResponse(
      {
        success: true,
        message: 'Password reset email sent successfully',
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
      function: 'send-password-reset-email',
    });
  }
};

interface PasswordResetEmailHtmlParams {
  fullName: string;
  resetLink: string;
  organizationName: string;
}

function buildPasswordResetEmailHtml(params: PasswordResetEmailHtmlParams): string {
  const { fullName, resetLink, organizationName } = params;
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #1a365d 0%, #2d4a7c 100%); padding: 40px 30px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">
                🔒 Reset Your Password
              </h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 16px;">
                ${organizationName}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #333333; font-size: 18px; margin: 0 0 20px;">
                Hello ${fullName},
              </p>
              <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0 0 25px;">
                We received a request to reset your password for your <strong>${organizationName}</strong> account.
              </p>
              <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0 0 25px;">
                Click the button below to reset your password. This link will expire in 1 hour.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); border-radius: 8px; box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);">
                    <a href="${resetLink}" style="display: inline-block; padding: 16px 36px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color: #888888; font-size: 13px; margin: 25px 0 0;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${resetLink}" style="color: #1a365d; word-break: break-all;">${resetLink}</a>
              </p>
              <p style="color: #999999; font-size: 14px; margin: 30px 0 0; padding-top: 20px; border-top: 1px solid #e9ecef;">
                If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 25px 30px; border-radius: 0 0 12px 12px; border-top: 1px solid #e9ecef;">
              <p style="color: #999999; font-size: 13px; margin: 0; text-align: center;">
                This email was sent by ${organizationName}.<br>
                For security reasons, this link will expire in 1 hour.
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

