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

/**
 * Renewal Reminder Email Function
 *
 * Checks for user plan assignments that are expiring within the next 7 days
 * and sends reminder emails. Designed to be invoked by a cron/scheduler.
 *
 * Reminder schedule:
 *   - 7 days before expiry
 *   - 3 days before expiry
 *   - 1 day before expiry
 */
const handler = async (req: Request): Promise<Response> => {
  console.log('send-renewal-reminder-email function invoked');

  if (req.method === 'OPTIONS') {
    return createJsonResponse(null, { status: 204, cors: corsOptions });
  }

  try {
    // Verify this is called with service role or authorized scheduler
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.includes(supabaseServiceKey) && !authHeader?.includes('Bearer')) {
      // Allow calls from Supabase cron (pg_net) which use service role
    }

    const now = new Date();
    const reminderWindows = [
      { daysOut: 7, label: '7 days' },
      { daysOut: 3, label: '3 days' },
      { daysOut: 1, label: '1 day' },
    ];

    let totalSent = 0;
    const errors: string[] = [];

    for (const window of reminderWindows) {
      // Find plans expiring within this window (±12 hours to avoid missing any)
      const targetDate = new Date(now.getTime() + window.daysOut * 24 * 60 * 60 * 1000);
      const windowStart = new Date(targetDate.getTime() - 12 * 60 * 60 * 1000);
      const windowEnd = new Date(targetDate.getTime() + 12 * 60 * 60 * 1000);

      const { data: expiringAssignments, error: queryError } = await supabase
        .from('user_plan_assignments')
        .select(
          `
          id,
          user_id,
          plan_id,
          expires_at,
          status,
          user_plans (
            display_name,
            plan_type
          )
        `
        )
        .eq('status', 'active')
        .not('expires_at', 'is', null)
        .gte('expires_at', windowStart.toISOString())
        .lte('expires_at', windowEnd.toISOString());

      if (queryError) {
        console.error(`Error querying expiring plans (${window.label}):`, queryError);
        errors.push(`Query error for ${window.label}: ${queryError.message}`);
        continue;
      }

      if (!expiringAssignments || expiringAssignments.length === 0) {
        console.log(`No plans expiring in ${window.label}`);
        continue;
      }

      console.log(`Found ${expiringAssignments.length} plans expiring in ~${window.label}`);

      for (const assignment of expiringAssignments) {
        try {
          // Check if we already sent a reminder for this window
          const reminderKey = `renewal_${window.daysOut}d`;
          const { data: existingLog } = await supabase
            .from('email_delivery_logs')
            .select('id')
            .eq('user_id', assignment.user_id)
            .eq('email_type', reminderKey)
            .gte('created_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
            .limit(1);

          if (existingLog && existingLog.length > 0) {
            console.log(`Already sent ${reminderKey} reminder to user ${assignment.user_id}`);
            continue;
          }

          // Get user profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('email, first_name, last_name, organization_id')
            .eq('user_id', assignment.user_id)
            .single();

          if (!profile?.email) {
            console.error(`No email for user ${assignment.user_id}`);
            continue;
          }

          // Check notification preferences
          const { data: preferences } = await supabase
            .from('notification_preferences')
            .select('email_enabled')
            .eq('user_id', assignment.user_id)
            .eq('organization_id', profile.organization_id)
            .single();

          if (preferences?.email_enabled === false) {
            console.log(`Email disabled for user ${assignment.user_id}`);
            continue;
          }

          const recipientName =
            [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'there';
          const planName =
            (assignment.user_plans as { display_name?: string } | null)?.display_name ||
            'your current plan';
          const expiresAt = new Date(assignment.expires_at);
          const formattedDate = expiresAt.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });

          // Get organization name
          let organizationName = 'Kourti Legal';
          if (profile.organization_id) {
            const { data: org } = await supabase
              .from('organizations')
              .select('name')
              .eq('id', profile.organization_id)
              .single();
            if (org?.name) organizationName = org.name;
          }

          const subject = `Your ${planName} plan expires in ${window.label}`;
          const htmlContent = buildRenewalEmailHtml({
            recipientName,
            planName,
            expiresIn: window.label,
            expirationDate: formattedDate,
            organizationName,
            billingUrl: `${appUrl}/settings?tab=billing`,
          });

          // Create delivery log
          const { data: logEntry } = await supabase
            .from('email_delivery_logs')
            .insert({
              user_id: assignment.user_id,
              organization_id: profile.organization_id,
              recipient_email: profile.email,
              subject,
              email_type: reminderKey,
              status: 'pending',
            })
            .select()
            .single();

          // Send email
          const { data: emailData, error: emailError } = await resend.emails.send({
            from: `${organizationName} <${fromEmail}>`,
            to: [profile.email],
            subject,
            html: htmlContent,
          });

          if (emailError) {
            console.error(`Failed to send renewal email to ${profile.email}:`, emailError);
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
            errors.push(`Send error for ${profile.email}: ${emailError.message}`);
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

          // Also create in-app notification
          if (profile.organization_id) {
            await supabase.from('notifications').insert({
              user_id: assignment.user_id,
              organization_id: profile.organization_id,
              title: `Plan expiring in ${window.label}`,
              description: `Your ${planName} plan expires on ${formattedDate}. Renew now to avoid interruption.`,
              type: 'info',
              status: 'unread',
            });
          }

          totalSent++;
          console.log(`Sent renewal reminder (${window.label}) to ${profile.email}`);
        } catch (err) {
          console.error(`Error processing assignment ${assignment.id}:`, err);
          errors.push(`Processing error for assignment ${assignment.id}`);
        }
      }
    }

    return createJsonResponse(
      {
        success: true,
        sent: totalSent,
        errors: errors.length > 0 ? errors : undefined,
      },
      { status: 200, cors: corsOptions }
    );
  } catch (error: unknown) {
    return createErrorResponse(error, corsOptions, {
      function: 'send-renewal-reminder-email',
    });
  }
};

interface RenewalEmailParams {
  recipientName: string;
  planName: string;
  expiresIn: string;
  expirationDate: string;
  organizationName: string;
  billingUrl: string;
}

function buildRenewalEmailHtml(params: RenewalEmailParams): string {
  const { recipientName, planName, expiresIn, expirationDate, organizationName, billingUrl } =
    params;

  const urgencyColor =
    params.expiresIn === '1 day'
      ? '#dc2626'
      : params.expiresIn === '3 days'
        ? '#f59e0b'
        : '#3b82f6';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Plan Renewal Reminder</title>
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

          <!-- Urgency Banner -->
          <tr>
            <td style="background-color: ${urgencyColor}; padding: 12px 30px;">
              <p style="color: #ffffff; margin: 0; font-size: 14px; font-weight: 600; text-align: center;">
                Your plan expires in ${expiresIn}
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #666666; font-size: 16px; margin: 0 0 20px;">
                Hello ${recipientName},
              </p>

              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 15px;">
                This is a friendly reminder that your <strong>${planName}</strong> plan is set to expire on <strong>${expirationDate}</strong>.
              </p>

              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 25px;">
                To continue enjoying uninterrupted access to all your features, please renew your subscription before it expires.
              </p>

              <table cellpadding="0" cellspacing="0" style="margin: 25px 0;">
                <tr>
                  <td style="background-color: #1a365d; border-radius: 6px;">
                    <a href="${billingUrl}" style="display: inline-block; padding: 14px 28px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">
                      Renew Now
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color: #999999; font-size: 14px; line-height: 1.5; margin: 20px 0 0;">
                If you have any questions about your plan or billing, please contact our support team.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 25px 30px; border-radius: 0 0 8px 8px; border-top: 1px solid #e9ecef;">
              <p style="color: #999999; font-size: 13px; margin: 0; text-align: center;">
                This is an automated reminder from ${organizationName}.<br>
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
