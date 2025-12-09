import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import nodemailer from "npm:nodemailer@6.9.8";

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// SMTP configuration
const smtpConfig = {
  host: Deno.env.get("SMTP_HOST") || "",
  port: parseInt(Deno.env.get("SMTP_PORT") || "587"),
  secure: Deno.env.get("SMTP_PORT") === "465",
  auth: {
    user: Deno.env.get("SMTP_USER") || "",
    pass: Deno.env.get("SMTP_PASS") || "",
  },
};

const fromEmail = Deno.env.get("SMTP_FROM_EMAIL") || "noreply@example.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
      return new Response(
        JSON.stringify({ error: 'Recipient email not found' }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const recipientEmail = profile.email;
    const recipientName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Team Member';
    const organizationId = profile.organization_id;

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

    console.log("Preparing to send email via SMTP:", {
      to: recipientEmail,
      subject: emailSubject,
      smtpHost: smtpConfig.host,
    });

    // Create transporter
    const transporter = nodemailer.createTransport(smtpConfig);

    // Verify SMTP connection
    try {
      await transporter.verify();
      console.log("SMTP connection verified successfully");
    } catch (verifyError: any) {
      console.error("SMTP verification failed:", verifyError.message);
      // Continue anyway, some SMTP servers don't support verify
    }

    // Send email
    const info = await transporter.sendMail({
      from: `${organizationName} <${fromEmail}>`,
      to: recipientEmail,
      subject: emailSubject,
      text: message,
      html: htmlContent,
    });

    console.log("Email sent successfully:", info.messageId);

    // Also create in-app notification
    if (organizationId) {
      await supabase.from('notifications').insert({
        user_id: recipientUserId,
        organization_id: organizationId,
        title,
        description: message,
        type: mapTypeToNotificationType(type),
        status: 'unread',
      });
      console.log("In-app notification created for user:", recipientUserId);
    }

    return new Response(JSON.stringify({ success: true, messageId: info.messageId }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-notification-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
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

serve(handler);
