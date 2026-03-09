// @ts-expect-error: Deno module
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
// @ts-expect-error: Deno module
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
// @ts-expect-error: Deno module
import { Resend } from 'https://esm.sh/resend@2.0.0';
import { createJsonResponse, CorsSecurityHeadersOptions } from '../_shared/responseHeaders.ts';
import { createErrorResponse } from '../_shared/errorHandling.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
const fromEmail = Deno.env.get('SMTP_FROM_EMAIL') || 'onboarding@resend.dev';
const appUrl = Deno.env.get('APP_URL') || 'https://app.kourti.com';

const corsOptions: CorsSecurityHeadersOptions = {
  origin: '*',
  allowMethods: ['POST', 'OPTIONS'],
};

// Inactivity threshold: 7 days
const INACTIVITY_DAYS = 7;

/**
 * Inactivity Email Function
 *
 * Checks for users who have not logged in for 7+ days and sends
 * a re-engagement email. Uses `last_login_at` from the profiles table.
 *
 * Designed to be invoked daily by a cron/scheduler.
 * Only sends one inactivity email per user per 7-day period to avoid spam.
 */
const handler = async (req: Request): Promise<Response> => {
  console.log('send-inactivity-email function invoked');

  if (req.method === 'OPTIONS') {
    return createJsonResponse(null, { status: 204, cors: corsOptions });
  }

  try {
    const now = new Date();
    const inactivityThreshold = new Date(now.getTime() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000);

    // Find users inactive for 7+ days
    // Only consider active users (not disabled)
    const { data: inactiveUsers, error: queryError } = await supabase
      .from('profiles')
      .select('user_id, email, first_name, last_name, organization_id, last_login_at, status')
      .eq('status', 'active')
      .is('disabled_at', null)
      .not('last_login_at', 'is', null)
      .lte('last_login_at', inactivityThreshold.toISOString());

    if (queryError) {
      console.error('Error querying inactive users:', queryError);
      throw new Error(`Query failed: ${queryError.message}`);
    }

    if (!inactiveUsers || inactiveUsers.length === 0) {
      console.log('No inactive users found');
      return createJsonResponse(
        { success: true, sent: 0, message: 'No inactive users' },
        { status: 200, cors: corsOptions }
      );
    }

    console.log(`Found ${inactiveUsers.length} inactive users`);

    let totalSent = 0;
    const errors: string[] = [];

    for (const user of inactiveUsers) {
      try {
        if (!user.email) continue;

        // Check if we already sent an inactivity email in the last 7 days
        const { data: existingLog } = await supabase
          .from('email_delivery_logs')
          .select('id')
          .eq('user_id', user.user_id)
          .eq('email_type', 'inactivity_reminder')
          .gte('created_at', inactivityThreshold.toISOString())
          .limit(1);

        if (existingLog && existingLog.length > 0) {
          console.log(`Already sent inactivity email to user ${user.user_id} this period`);
          continue;
        }

        // Check notification preferences
        if (user.organization_id) {
          const { data: preferences } = await supabase
            .from('notification_preferences')
            .select('email_enabled')
            .eq('user_id', user.user_id)
            .eq('organization_id', user.organization_id)
            .single();

          if (preferences?.email_enabled === false) {
            console.log(`Email disabled for user ${user.user_id}`);
            continue;
          }
        }

        const recipientName =
          [user.first_name, user.last_name].filter(Boolean).join(' ') || 'there';
        const lastLoginDate = new Date(user.last_login_at);
        const daysSinceLogin = Math.floor(
          (now.getTime() - lastLoginDate.getTime()) / (24 * 60 * 60 * 1000)
        );

        // Get organization name
        let organizationName = 'Kourti Legal';
        if (user.organization_id) {
          const { data: org } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', user.organization_id)
            .single();
          if (org?.name) organizationName = org.name;
        }

        const subject = `We miss you! It's been ${daysSinceLogin} days since your last visit`;
        const htmlContent = buildInactivityEmailHtml({
          recipientName,
          daysSinceLogin,
          organizationName,
          dashboardUrl: `${appUrl}/`,
        });

        // Create delivery log
        const { data: logEntry } = await supabase
          .from('email_delivery_logs')
          .insert({
            user_id: user.user_id,
            organization_id: user.organization_id,
            recipient_email: user.email,
            subject,
            email_type: 'inactivity_reminder',
            status: 'pending',
          })
          .select()
          .single();

        // Send email
        const { data: emailData, error: emailError } = await resend.emails.send({
          from: `${organizationName} <${fromEmail}>`,
          to: [user.email],
          subject,
          html: htmlContent,
        });

        if (emailError) {
          console.error(`Failed to send inactivity email to ${user.email}:`, emailError);
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
          errors.push(`Send error for ${user.email}: ${emailError.message}`);
          continue;
        }

        // Update delivery log
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

        totalSent++;
        console.log(`Sent inactivity email to ${user.email} (${daysSinceLogin} days inactive)`);
      } catch (err) {
        console.error(`Error processing user ${user.user_id}:`, err);
        errors.push(`Processing error for user ${user.user_id}`);
      }
    }

    return createJsonResponse(
      {
        success: true,
        sent: totalSent,
        totalInactive: inactiveUsers.length,
        errors: errors.length > 0 ? errors : undefined,
      },
      { status: 200, cors: corsOptions }
    );
  } catch (error: unknown) {
    return createErrorResponse(error, corsOptions, {
      function: 'send-inactivity-email',
    });
  }
};

interface InactivityEmailParams {
  recipientName: string;
  daysSinceLogin: number;
  organizationName: string;
  dashboardUrl: string;
}

function buildInactivityEmailHtml(params: InactivityEmailParams): string {
  const { recipientName, daysSinceLogin, organizationName, dashboardUrl } = params;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>We miss you!</title>
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
                ${organizationName}
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
                We noticed you've been away
              </h2>

              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 15px;">
                It's been <strong>${daysSinceLogin} days</strong> since you last logged in to ${organizationName}. Your workspace is ready and waiting for you.
              </p>

              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 10px;">
                Here's what you might have missed:
              </p>

              <ul style="color: #333333; font-size: 15px; line-height: 1.8; margin: 0 0 25px; padding-left: 20px;">
                <li>New updates to your matters and cases</li>
                <li>Pending tasks and calendar events</li>
                <li>Client messages and document activity</li>
              </ul>

              <table cellpadding="0" cellspacing="0" style="margin: 25px 0;">
                <tr>
                  <td style="background-color: #1a365d; border-radius: 6px;">
                    <a href="${dashboardUrl}" style="display: inline-block; padding: 14px 28px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">
                      Return to Dashboard
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color: #999999; font-size: 14px; line-height: 1.5; margin: 20px 0 0;">
                If you're having trouble accessing your account, please don't hesitate to contact our support team.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 25px 30px; border-radius: 0 0 8px 8px; border-top: 1px solid #e9ecef;">
              <p style="color: #999999; font-size: 13px; margin: 0; text-align: center;">
                This is an automated message from ${organizationName}.<br>
                You're receiving this because you haven't logged in for ${daysSinceLogin} days.<br>
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
