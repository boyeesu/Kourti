// @ts-expect-error: Deno module
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
// @ts-expect-error: Deno module
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
// @ts-expect-error: Deno module
import { Resend } from 'https://esm.sh/resend@2.0.0';
import { createJsonResponse, CorsSecurityHeadersOptions } from '../_shared/responseHeaders.ts';
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
 * a warm re-engagement email from Kourti AI. Uses `last_login_at` from profiles.
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
        let organizationName = 'Kourti AI';
        if (user.organization_id) {
          const { data: org } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', user.organization_id)
            .single();
          if (org?.name) organizationName = org.name;
        }

        const subject = `It's been a while — your workspace is waiting for you`;
        const bodyHtml = buildInactivityBody(recipientName, daysSinceLogin, `${appUrl}/`);
        const htmlContent = wrapInEmailTemplate(bodyHtml, {
          preheader: `We noticed you haven't visited in ${daysSinceLogin} days. Your workspace is ready for you.`,
          showSignature: true,
          showUnsubscribe: true,
          organizationName,
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
          from: `Rachael from Kourti AI <${fromEmail}>`,
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

function buildInactivityBody(
  recipientName: string,
  daysSinceLogin: number,
  dashboardUrl: string
): string {
  return `
    ${buildGreeting(recipientName)}

    ${buildParagraph(
      `It's been <strong>${daysSinceLogin} days</strong> since your last visit, and I wanted to check in. Your workspace is exactly as you left it — organized and ready whenever you are.`
    )}

    ${buildParagraph(`While you were away, here's what might need your attention:`)}

    ${buildFeatureList([
      'Updates to your active matters and cases',
      'Pending tasks and upcoming calendar events',
      'New document activity and client messages',
    ])}

    ${buildCtaButton('Return to Your Dashboard', dashboardUrl)}

    ${buildDivider()}

    ${buildParagraph(
      `If something about Kourti AI isn't working the way you'd like, I'd love to hear about it. We're constantly improving based on what our users tell us, and your experience matters to us.`
    )}

    ${buildParagraph(
      `You can always reach our team at <a href="mailto:${BRAND.supportEmail}" style="color: ${BRAND.colors.accent}; text-decoration: none; font-weight: 500;">${BRAND.supportEmail}</a>.`
    )}
  `;
}

serve(handler);
