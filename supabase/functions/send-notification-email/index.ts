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

interface NotificationEmailRequest {
  type: 'task_assigned' | 'case_update' | 'document_shared' | 'calendar_reminder' | 'invoice_created' | 'general';
  recipientUserId: string;
  subject?: string;
  title: string;
  message: string;
  actionUrl?: string;
  actionText?: string;
  metadata?: Record<string, unknown>;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("send-notification-email function invoked");

  const requestOrigin = req.headers.get("Origin");
  const corsOptions = getCorsOptions(requestOrigin);

  if (req.method === "OPTIONS") {
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

  let deliveryLogId: string | null = null;
  let notificationId: string | null = null;

  try {
    const requestData: NotificationEmailRequest = await req.json();
    const { type, recipientUserId, subject, title, message, actionUrl, actionText, metadata } = requestData;

    console.log('Processing notification email:', { type, recipientUserId, title });

    // Get recipient's email from profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, first_name, last_name, organization_id')
      .eq('user_id', recipientUserId)
      .single();

    if (profileError || !profile?.email) {
      console.error('Could not find recipient email:', profileError);
      return createJsonResponse(
        { 
          success: false,
          error: 'Recipient email not found',
          errorCode: 'NOT_FOUND'
        },
        { status: 400, cors: corsOptions }
      );
    }

    const recipientEmail = profile.email;
    const recipientName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Team Member';
    const organizationId = profile.organization_id;

    // Check notification preferences
    const { data: preferences } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', recipientUserId)
      .eq('organization_id', organizationId)
      .single();

    // Check if email notifications are enabled for this type
    const emailEnabled = preferences?.email_enabled !== false;
    const typeEnabled = checkTypePreference(preferences, type);

    if (!emailEnabled || !typeEnabled) {
      console.log('Email notifications disabled for user:', recipientUserId);
      // Still create in-app notification
      if (organizationId) {
        const { data: notif } = await supabase.from('notifications').insert({
          user_id: recipientUserId,
          organization_id: organizationId,
          title,
          description: message,
          type: mapTypeToNotificationType(type),
          status: 'unread',
        }).select().single();
        notificationId = notif?.id || null;
      }
      const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
      return createJsonResponse(
        { success: true, skipped: true, reason: 'preferences' },
        {
          status: 200,
          cors: corsOptions,
          headers: rateLimitHeaders,
        }
      );
    }

    // Get organization name
    let organizationName = 'Ream AI Legal';
    if (organizationId) {
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', organizationId)
        .single();
      if (org?.name) organizationName = org.name;
    }

    // Create in-app notification first
    if (organizationId) {
      const { data: notif } = await supabase.from('notifications').insert({
        user_id: recipientUserId,
        organization_id: organizationId,
        title,
        description: message,
        type: mapTypeToNotificationType(type),
        status: 'unread',
      }).select().single();
      notificationId = notif?.id || null;
      console.log("In-app notification created for user:", recipientUserId);
    }

    // Email subject based on type
    const emailSubject = subject || getDefaultSubject(type, title);
    
    // Build HTML email
    const htmlContent = buildEmailHtml({
      type,
      title,
      message,
      recipientName,
      organizationName,
      actionUrl,
      actionText,
      metadata,
    });

    // Create delivery log entry
    const { data: logEntry, error: logError } = await supabase
      .from('email_delivery_logs')
      .insert({
        user_id: recipientUserId,
        organization_id: organizationId,
        notification_id: notificationId,
        recipient_email: recipientEmail,
        subject: emailSubject,
        email_type: type,
        status: 'pending',
      })
      .select()
      .single();

    if (logError) {
      console.error('Failed to create delivery log:', logError);
    } else {
      deliveryLogId = logEntry?.id || null;
    }

    console.log("Sending email via Resend:", {
      to: recipientEmail,
      subject: emailSubject,
    });

    const { data, error } = await resend.emails.send({
      from: `${organizationName} <${fromEmail}>`,
      to: [recipientEmail],
      subject: emailSubject,
      html: htmlContent,
    });

    if (error) {
      console.error("Resend error:", error);
      
      // Update delivery log with error
      if (deliveryLogId) {
        await supabase
          .from('email_delivery_logs')
          .update({
            status: 'failed',
            error_message: error.message,
            error_stack: JSON.stringify(error),
            retry_count: 1,
            last_retry_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', deliveryLogId);
      }

      // Retry logic
      if (deliveryLogId) {
        const shouldRetry = await shouldRetryEmail(deliveryLogId);
        if (shouldRetry) {
          console.log('Scheduling retry for email delivery');
          // In a production system, you might want to use a queue system here
        }
      }

      throw new Error(error.message);
    }

    console.log("Email sent successfully:", data?.id);

    // Update delivery log with success
    if (deliveryLogId) {
      await supabase
        .from('email_delivery_logs')
        .update({
          status: 'sent',
          provider_message_id: data?.id,
          provider_response: data as any,
          delivered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', deliveryLogId);
    }

    const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
    return createJsonResponse(
      { success: true, messageId: data?.id, deliveryLogId },
      {
        status: 200,
        cors: corsOptions,
        headers: rateLimitHeaders,
      }
    );
  } catch (error: unknown) {
    // Update delivery log with error if it exists
    if (deliveryLogId && error instanceof Error) {
      await supabase
        .from('email_delivery_logs')
        .update({
          status: 'failed',
          error_message: error.message,
          error_stack: error.stack,
          updated_at: new Date().toISOString(),
        })
        .eq('id', deliveryLogId);
    }

    return createErrorResponse(error, corsOptions, {
      function: 'send-notification-email',
    });
  }
};

function getDefaultSubject(type: string, title: string): string {
  const subjectMap: Record<string, string> = {
    task_assigned: `New Task: ${title}`,
    case_update: `Case Update: ${title}`,
    document_shared: `Document Shared: ${title}`,
    calendar_reminder: `Reminder: ${title}`,
    invoice_created: `Invoice: ${title}`,
    general: title,
  };
  return subjectMap[type] || title;
}

function mapTypeToNotificationType(type: string): string {
  const typeMap: Record<string, string> = {
    task_assigned: 'info',
    case_update: 'case',
    document_shared: 'document',
    calendar_reminder: 'calendar',
    invoice_created: 'info',
    general: 'info',
  };
  return typeMap[type] || 'info';
}

interface EmailHtmlParams {
  type: string;
  title: string;
  message: string;
  recipientName: string;
  organizationName: string;
  actionUrl?: string;
  actionText?: string;
  metadata?: Record<string, unknown>;
}

function buildEmailHtml(params: EmailHtmlParams): string {
  const { type, title, message, recipientName, organizationName, actionUrl, actionText } = params;
  
  const iconMap: Record<string, string> = {
    task_assigned: '📋',
    case_update: '⚖️',
    document_shared: '📄',
    calendar_reminder: '📅',
    invoice_created: '💰',
    general: '🔔',
  };
  
  const icon = iconMap[type] || '🔔';
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a365d 0%, #2d4a7c 100%); padding: 30px; border-radius: 8px 8px 0 0;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">
                ${icon} ${organizationName}
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #666666; font-size: 16px; margin: 0 0 20px;">
                Hello ${recipientName},
              </p>
              
              <h2 style="color: #1a365d; font-size: 20px; margin: 0 0 15px;">
                ${title}
              </h2>
              
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 25px;">
                ${message}
              </p>
              
              ${actionUrl ? `
              <table cellpadding="0" cellspacing="0" style="margin: 25px 0;">
                <tr>
                  <td style="background-color: #1a365d; border-radius: 6px;">
                    <a href="${actionUrl}" style="display: inline-block; padding: 14px 28px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">
                      ${actionText || 'View Details'}
                    </a>
                  </td>
                </tr>
              </table>
              ` : ''}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 25px 30px; border-radius: 0 0 8px 8px; border-top: 1px solid #e9ecef;">
              <p style="color: #999999; font-size: 13px; margin: 0; text-align: center;">
                This is an automated notification from ${organizationName}.<br>
                Please do not reply to this email.
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

function checkTypePreference(preferences: any, type: string): boolean {
  if (!preferences) return true; // Default to enabled if no preferences
  
  const typeMap: Record<string, keyof typeof preferences> = {
    task_assigned: 'task_notifications',
    case_update: 'case_notifications',
    document_shared: 'document_notifications',
    calendar_reminder: 'calendar_notifications',
    invoice_created: 'invoice_notifications',
    general: 'general_notifications',
  };
  
  const preferenceKey = typeMap[type] || 'general_notifications';
  return preferences[preferenceKey] !== false;
}

async function shouldRetryEmail(deliveryLogId: string): Promise<boolean> {
  const { data: log } = await supabase
    .from('email_delivery_logs')
    .select('retry_count, max_retries')
    .eq('id', deliveryLogId)
    .single();
  
  if (!log) return false;
  return (log.retry_count || 0) < (log.max_retries || 3);
}

serve(handler);
