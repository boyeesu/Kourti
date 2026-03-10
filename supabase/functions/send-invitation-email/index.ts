// @ts-ignore: Deno module
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
// @ts-ignore: Deno module
import { Resend } from 'https://esm.sh/resend@2.0.0';
import {
  createEmptyResponse,
  createJsonResponse,
  CorsSecurityHeadersOptions,
} from '../_shared/responseHeaders.ts';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  RATE_LIMIT_PRESETS,
  createRateLimitHeaders,
} from '../_shared/rateLimiting.ts';
import { createErrorResponse } from '../_shared/errorHandling.ts';
import {
  wrapInEmailTemplate,
  buildGreeting,
  buildParagraph,
  buildCtaButton,
  buildFallbackUrl,
  buildInfoBox,
  BRAND,
} from '../_shared/emailTemplate.ts';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
const fromEmail = Deno.env.get('SMTP_FROM_EMAIL') || 'onboarding@resend.dev';

const ALLOWED_ORIGINS = [
  Deno.env.get('APP_URL'),
  ...(Deno.env.get('ENVIRONMENT') !== 'production'
    ? [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:8080',
        'http://localhost:8081',
        'http://localhost:8082',
        'http://localhost:8083',
      ]
    : []),
  'https://app.kourti.com',
]
  .flatMap((value) => (value ? value.split(',') : []))
  .filter(Boolean)
  .map((origin) => {
    if (origin && !origin.startsWith('http://') && !origin.startsWith('https://')) {
      return `https://${origin}`;
    }
    return origin;
  })
  .filter((origin) => origin && (origin.startsWith('http://') || origin.startsWith('https://')));

function getCorsOptions(requestOrigin: string | null): CorsSecurityHeadersOptions {
  const origin =
    requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
      ? requestOrigin
      : ALLOWED_ORIGINS[0] || 'https://app.kourti.com';

  return {
    origin,
    requestOrigin,
    allowedOrigins: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : undefined,
    allowCredentials: true,
    allowMethods: ['POST', 'OPTIONS'],
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
  console.log('send-invitation-email function invoked');

  const requestOrigin = req.headers.get('Origin');
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
    // --- Authentication: require service-role key (server-to-server only) ---
    const authHeader = req.headers.get('Authorization');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!authHeader || !supabaseServiceKey) {
      return createJsonResponse(
        { success: false, error: 'Unauthorized', errorCode: 'UNAUTHORIZED' },
        { status: 401, cors: corsOptions }
      );
    }

    const bearerToken = authHeader.replace('Bearer ', '').trim();
    if (bearerToken !== supabaseServiceKey) {
      return createJsonResponse(
        {
          success: false,
          error: 'Forbidden: service-role access required',
          errorCode: 'FORBIDDEN',
        },
        { status: 403, cors: corsOptions }
      );
    }

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

    console.log('Sending invitation email via Resend:', { to: email, subject: emailSubject });

    const { data, error } = await resend.emails.send({
      from: `${organizationName} <${fromEmail}>`,
      to: [email],
      subject: emailSubject,
      html: htmlContent,
    });

    if (error) {
      console.error('Resend error:', error);
      throw new Error(error.message);
    }

    console.log('Invitation email sent successfully:', data?.id);

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
  const {
    firstName,
    lastName,
    role,
    department,
    organizationName,
    inviterName,
    loginUrl,
    tempPassword,
    email,
  } = params;

  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'there';
  const roleDisplay = role.charAt(0).toUpperCase() + role.slice(1);
  const departmentLine = department
    ? `<p style="color: ${BRAND.colors.textSecondary}; font-size: 14px; margin: 4px 0 0;">Department: ${department}</p>`
    : '';

  const bodyHtml = `
    ${buildGreeting(fullName)}

    ${buildParagraph(
      `<strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> as a <strong>${roleDisplay}</strong>.`
    )}
    ${departmentLine}

    ${buildParagraph(`Your account has been created! Use the credentials below to log in:`)}

    ${buildInfoBox(`
      <table cellpadding="0" cellspacing="0" style="width: 100%;">
        <tr>
          <td style="padding: 6px 0;">
            <span style="color: ${BRAND.colors.textSecondary}; font-size: 14px; font-weight: 500;">Email:</span>
            <span style="color: ${BRAND.colors.primary}; font-size: 15px; font-weight: 600; margin-left: 10px;">${email}</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 6px 0; border-top: 1px solid ${BRAND.colors.border};">
            <span style="color: ${BRAND.colors.textSecondary}; font-size: 14px; font-weight: 500;">Temporary Password:</span>
            <span style="color: ${BRAND.colors.primary}; font-size: 15px; font-weight: 600; font-family: monospace; background-color: #E8ECF1; padding: 3px 8px; border-radius: 4px; margin-left: 10px;">${tempPassword}</span>
          </td>
        </tr>
      </table>
    `)}

    <p style="color: ${BRAND.colors.urgent}; font-size: 14px; margin: 15px 0; padding: 12px 16px; background-color: #FEF2F2; border-radius: 8px; border-left: 4px solid ${BRAND.colors.urgent};">
      <strong>Important:</strong> You will be required to change your password after your first login.
    </p>

    ${buildCtaButton('Sign In', loginUrl)}

    ${buildFallbackUrl(loginUrl)}
  `;

  return wrapInEmailTemplate(bodyHtml, {
    preheader: `${inviterName} has invited you to join ${organizationName}`,
    organizationName,
    footerText: `This invitation was sent by ${organizationName}.<br>If you didn't expect this email, please contact your administrator.`,
  });
}

function buildInvitationEmailHtml(params: InvitationEmailHtmlParams): string {
  const {
    firstName,
    lastName,
    role,
    department,
    organizationName,
    inviterName,
    signupUrl,
    ssoEnforced,
    ssoLinks,
  } = params;

  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'there';
  const roleDisplay = role.charAt(0).toUpperCase() + role.slice(1);
  const departmentLine = department
    ? `<p style="color: ${BRAND.colors.textSecondary}; font-size: 14px; margin: 4px 0 0;">Department: ${department}</p>`
    : '';

  // Build SSO buttons HTML
  let ssoButtonsHtml = '';
  if (ssoLinks.length > 0) {
    const ssoButtons = ssoLinks
      .map((link) => {
        const providerName = link.provider === 'google' ? 'Google' : 'Microsoft';
        const providerColor = link.provider === 'google' ? '#4285F4' : '#00A4EF';

        return `
        <tr>
          <td style="padding: 6px 0;">
            <a href="${link.url}" style="display: inline-block; width: 100%; padding: 13px 24px; background-color: ${providerColor}; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 500; font-size: 15px; text-align: center;">
              Sign in with ${providerName}
            </a>
          </td>
        </tr>
      `;
      })
      .join('');

    ssoButtonsHtml = `
      <table cellpadding="0" cellspacing="0" style="margin: 20px 0; width: 100%;">
        ${ssoButtons}
      </table>
    `;
  }

  // Build main CTA section
  let mainCtaHtml = '';
  if (ssoEnforced && ssoLinks.length > 0) {
    mainCtaHtml = `
      ${buildParagraph(
        ssoLinks.length === 1
          ? 'Please sign in using your organization account:'
          : 'Please sign in using one of your organization accounts:'
      )}
      ${ssoButtonsHtml}
    `;
  } else if (ssoLinks.length > 0) {
    mainCtaHtml = `
      ${buildParagraph('You can sign in using your organization account or create a new account:')}
      ${ssoButtonsHtml}
      <div style="text-align: center; margin: 16px 0; color: ${BRAND.colors.textLight}; font-size: 14px;">or</div>
      ${buildCtaButton('Create Account with Email', signupUrl)}
    `;
  } else {
    mainCtaHtml = `
      ${buildParagraph('Click the button below to create your account and set your password:')}
      ${buildCtaButton('Accept Invitation', signupUrl)}
    `;
  }

  const bodyHtml = `
    ${buildGreeting(fullName)}

    ${buildParagraph(
      `<strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> as a <strong>${roleDisplay}</strong>.`
    )}
    ${departmentLine}

    ${mainCtaHtml}

    ${!ssoEnforced ? buildFallbackUrl(signupUrl) : ''}
  `;

  return wrapInEmailTemplate(bodyHtml, {
    preheader: `${inviterName} has invited you to join ${organizationName}`,
    organizationName,
    footerText: `This invitation was sent by ${organizationName}.<br>If you didn't expect this email, you can safely ignore it.`,
  });
}

serve(handler);
