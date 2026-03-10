// @ts-expect-error: Deno module
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
// @ts-expect-error: Deno module
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
// @ts-expect-error: Deno module
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
  buildFeatureList,
  buildDivider,
  BRAND,
} from '../_shared/emailTemplate.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
const fromEmail = Deno.env.get('SMTP_FROM_EMAIL') || 'onboarding@resend.dev';
const appUrl = Deno.env.get('APP_URL') || 'https://app.kourti.com';

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

interface WelcomeEmailRequest {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Welcome Email Edge Function
 *
 * Sends a warm, personal welcome email from Rachael Eugene Michael (CEO)
 * when a new user signs up for Kourti AI.
 */
const handler = async (req: Request): Promise<Response> => {
  console.log('send-welcome-email function invoked');

  const requestOrigin = req.headers.get('Origin');
  const corsOptions = getCorsOptions(requestOrigin);

  if (req.method === 'OPTIONS') {
    return createEmptyResponse({ status: 204, cors: corsOptions });
  }

  // Rate limiting
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
    // Authentication: require service-role key or valid JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return createJsonResponse(
        { success: false, error: 'Authentication required', errorCode: 'UNAUTHORIZED' },
        { status: 401, cors: corsOptions }
      );
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const isServiceRole = token === supabaseServiceKey;

    if (!isServiceRole) {
      const {
        data: { user: callerUser },
        error: authError,
      } = await supabase.auth.getUser(token);
      if (authError || !callerUser) {
        return createJsonResponse(
          { success: false, error: 'Invalid or expired token', errorCode: 'UNAUTHORIZED' },
          { status: 401, cors: corsOptions }
        );
      }
    }

    const { userId, email, firstName, lastName }: WelcomeEmailRequest = await req.json();

    console.log('Processing welcome email for:', email);

    // Check if we already sent a welcome email to this user
    const { data: existingLog } = await supabase
      .from('email_delivery_logs')
      .select('id')
      .eq('user_id', userId)
      .eq('email_type', 'welcome')
      .limit(1);

    if (existingLog && existingLog.length > 0) {
      console.log('Welcome email already sent to user:', userId);
      const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
      return createJsonResponse(
        { success: true, skipped: true, reason: 'already_sent' },
        { status: 200, cors: corsOptions, headers: rateLimitHeaders }
      );
    }

    const recipientName = [firstName, lastName].filter(Boolean).join(' ') || 'there';
    const dashboardUrl = `${appUrl}/`;

    // Build the warm, personal welcome email body
    const bodyHtml = buildWelcomeEmailBody(recipientName, dashboardUrl);
    const htmlContent = wrapInEmailTemplate(bodyHtml, {
      preheader: `Welcome to Kourti AI! We're so glad you're here, ${recipientName}.`,
      showSignature: true,
      showUnsubscribe: true,
    });

    const emailSubject = `Welcome to Kourti AI — we're glad you're here`;

    // Create delivery log
    const { data: logEntry } = await supabase
      .from('email_delivery_logs')
      .insert({
        user_id: userId,
        recipient_email: email,
        subject: emailSubject,
        email_type: 'welcome',
        status: 'pending',
      })
      .select()
      .single();

    // Send email
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: `Rachael from Kourti AI <${fromEmail}>`,
      to: [email],
      subject: emailSubject,
      html: htmlContent,
    });

    if (emailError) {
      console.error('Resend error:', emailError);
      if (logEntry?.id) {
        await supabase
          .from('email_delivery_logs')
          .update({
            status: 'failed',
            error_message: emailError.message,
            updated_at: new Date().toISOString(),
          })
          .eq('id', logEntry.id);
      }
      throw new Error(emailError.message);
    }

    console.log('Welcome email sent successfully:', emailData?.id);

    if (logEntry?.id) {
      await supabase
        .from('email_delivery_logs')
        .update({
          status: 'sent',
          provider_message_id: emailData?.id,
          delivered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', logEntry.id);
    }

    const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
    return createJsonResponse(
      { success: true, messageId: emailData?.id },
      { status: 200, cors: corsOptions, headers: rateLimitHeaders }
    );
  } catch (error: unknown) {
    return createErrorResponse(error, corsOptions, {
      function: 'send-welcome-email',
    });
  }
};

function buildWelcomeEmailBody(recipientName: string, dashboardUrl: string): string {
  return `
    ${buildGreeting(recipientName)}

    ${buildParagraph(
      `Thank you for joining <strong>Kourti AI</strong>. I'm Rachael, and I built this platform because I've seen firsthand how overwhelming legal operations can be — the scattered documents, the missed deadlines, the constant juggling.`
    )}

    ${buildParagraph(
      `I wanted to create something that actually makes your work feel lighter. Kourti AI is designed to be your calm in the chaos — a place where everything you need is organized, accessible, and working <em>for</em> you.`
    )}

    ${buildParagraph(`Here are a few things you can start exploring right away:`)}

    ${buildFeatureList([
      'Manage your cases and matters in one clear view',
      'Draft, review, and analyze contracts with AI assistance',
      'Keep your calendar, tasks, and deadlines in sync',
      'Organize documents and access them from anywhere',
      'Generate invoices and track billing effortlessly',
    ])}

    ${buildCtaButton('Go to Your Dashboard', dashboardUrl)}

    ${buildDivider()}

    ${buildParagraph(
      `I genuinely want Kourti AI to work beautifully for you. If something feels off, or if there's a feature you wish existed — <strong>please tell me</strong>. I read every piece of feedback and it directly shapes what we build next.`
    )}

    ${buildParagraph(
      `You can always reach us at <a href="mailto:${BRAND.supportEmail}" style="color: ${BRAND.colors.accent}; text-decoration: none; font-weight: 500;">${BRAND.supportEmail}</a>. We're here for you.`
    )}
  `;
}

serve(handler);
