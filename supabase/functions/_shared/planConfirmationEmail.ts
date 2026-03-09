/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-expect-error: Deno module
import { Resend } from 'https://esm.sh/resend@2.0.0';
// @ts-expect-error: Deno module
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { escapeHtml } from './htmlEscape.ts';

declare const Deno: {
  env: { get(key: string): string | undefined };
};

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
const fromEmail = Deno.env.get('SMTP_FROM_EMAIL') || 'onboarding@resend.dev';
const appUrl = Deno.env.get('APP_URL') || 'https://app.kourti.com';

type SupabaseClient = ReturnType<typeof createClient>;

export interface PlanConfirmationParams {
  supabase: SupabaseClient;
  userId: string;
  planId: string;
  organizationId: string;
  billingInterval: string;
  isRenewal: boolean;
  transactionRef?: string;
  amount?: number;
  currency?: string;
}

/**
 * Sends a plan purchase/renewal confirmation email to the user.
 * Logs the delivery in email_delivery_logs. Non-throwing — logs errors but does not fail the caller.
 */
export async function sendPlanConfirmationEmail(params: PlanConfirmationParams): Promise<void> {
  const {
    supabase,
    userId,
    planId,
    organizationId,
    billingInterval,
    isRenewal,
    transactionRef,
    amount,
    currency,
  } = params;

  try {
    // Fetch user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, first_name, last_name')
      .eq('user_id', userId)
      .single();

    if (!profile?.email) {
      console.warn(`[plan-confirmation-email] No email found for user ${userId}, skipping`);
      return;
    }

    const recipientEmail: string = profile.email;
    const recipientName: string =
      [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Valued Customer';

    // Fetch plan details
    const { data: plan } = await supabase
      .from('user_plans')
      .select('display_name, plan_type, price_monthly, price_yearly, currency')
      .eq('id', planId)
      .single();

    const planName: string = plan?.display_name || plan?.plan_type || 'Selected Plan';
    const planPrice = billingInterval === 'yearly' ? plan?.price_yearly : plan?.price_monthly;
    const planCurrency: string = currency || plan?.currency || 'NGN';
    const displayAmount = amount ?? planPrice;

    // Fetch organization name
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single();

    const organizationName: string = org?.name || 'Ream AI Legal';

    const action = isRenewal ? 'Renewed' : 'Activated';
    const emailSubject = `Plan ${action}: ${planName}`;

    const periodLabel = billingInterval === 'yearly' ? 'year' : 'month';
    const formattedAmount =
      displayAmount != null
        ? `${planCurrency} ${Number(displayAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
        : null;

    const htmlContent = buildConfirmationEmailHtml({
      recipientName,
      planName,
      action,
      billingInterval,
      periodLabel,
      formattedAmount,
      transactionRef,
      organizationName,
    });

    // Create delivery log
    let deliveryLogId: string | null = null;
    const { data: logEntry } = await supabase
      .from('email_delivery_logs')
      .insert({
        user_id: userId,
        organization_id: organizationId,
        recipient_email: recipientEmail,
        subject: emailSubject,
        email_type: 'plan_confirmation',
        status: 'pending',
      } as any)
      .select('id')
      .single();

    deliveryLogId = logEntry?.id || null;

    // Send via Resend
    const { data: emailResult, error: emailError } = await resend.emails.send({
      from: `${organizationName} <${fromEmail}>`,
      to: [recipientEmail],
      subject: emailSubject,
      html: htmlContent,
    });

    if (emailError) {
      console.error('[plan-confirmation-email] Resend error:', emailError);
      if (deliveryLogId) {
        await supabase
          .from('email_delivery_logs')
          .update({
            status: 'failed',
            error_message: emailError.message,
            updated_at: new Date().toISOString(),
          } as any)
          .eq('id', deliveryLogId);
      }
      return;
    }

    console.log(
      `[plan-confirmation-email] Sent to ${recipientEmail}, messageId=${emailResult?.id}`
    );

    if (deliveryLogId) {
      await supabase
        .from('email_delivery_logs')
        .update({
          status: 'sent',
          provider_message_id: emailResult?.id,
          delivered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', deliveryLogId);
    }
  } catch (error) {
    console.error('[plan-confirmation-email] Failed to send confirmation email:', error);
    // Non-throwing: email failure should not block the payment flow
  }
}

interface ConfirmationEmailHtmlParams {
  recipientName: string;
  planName: string;
  action: string;
  billingInterval: string;
  periodLabel: string;
  formattedAmount: string | null;
  transactionRef?: string;
  organizationName: string;
}

function buildConfirmationEmailHtml(params: ConfirmationEmailHtmlParams): string {
  const {
    recipientName,
    planName,
    action,
    billingInterval,
    periodLabel,
    formattedAmount,
    transactionRef,
    organizationName,
  } = params;

  const amountRow = formattedAmount
    ? `<tr>
        <td style="padding: 8px 0; color: #666666; font-size: 14px;">Amount</td>
        <td style="padding: 8px 0; color: #1a365d; font-size: 14px; font-weight: 600; text-align: right;">${escapeHtml(formattedAmount)}</td>
      </tr>`
    : '';

  const refRow = transactionRef
    ? `<tr>
        <td style="padding: 8px 0; color: #666666; font-size: 14px;">Reference</td>
        <td style="padding: 8px 0; color: #1a365d; font-size: 14px; text-align: right; word-break: break-all;">${escapeHtml(transactionRef)}</td>
      </tr>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Plan ${escapeHtml(action)} Confirmation</title>
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
                ${escapeHtml(organizationName)}
              </h1>
            </td>
          </tr>

          <!-- Success Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); padding: 20px 30px; text-align: center;">
              <p style="color: #ffffff; margin: 0; font-size: 18px; font-weight: 600;">
                Plan Successfully ${escapeHtml(action)}
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #666666; font-size: 16px; margin: 0 0 20px;">
                Hello ${escapeHtml(recipientName)},
              </p>

              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 25px;">
                Your <strong>${escapeHtml(planName)}</strong> plan has been successfully ${action.toLowerCase()}. You now have full access to all features included in your plan.
              </p>

              <!-- Order Summary -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 6px; padding: 20px; margin: 0 0 25px;">
                <tr>
                  <td>
                    <p style="color: #1a365d; font-size: 16px; font-weight: 600; margin: 0 0 12px;">
                      Subscription Details
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0; color: #666666; font-size: 14px;">Plan</td>
                        <td style="padding: 8px 0; color: #1a365d; font-size: 14px; font-weight: 600; text-align: right;">${escapeHtml(planName)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #666666; font-size: 14px;">Billing Cycle</td>
                        <td style="padding: 8px 0; color: #1a365d; font-size: 14px; font-weight: 600; text-align: right;">${escapeHtml(billingInterval.charAt(0).toUpperCase() + billingInterval.slice(1))} (per ${escapeHtml(periodLabel)})</td>
                      </tr>
                      ${amountRow}
                      ${refRow}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin: 25px 0;">
                <tr>
                  <td style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); border-radius: 6px;">
                    <a href="${escapeHtml(appUrl)}/dashboard" style="display: inline-block; padding: 14px 28px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">
                      Go to Dashboard
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color: #999999; font-size: 14px; line-height: 1.5; margin: 0;">
                If you have any questions about your subscription, please don't hesitate to reach out to our support team.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 25px 30px; border-radius: 0 0 8px 8px; border-top: 1px solid #e9ecef;">
              <p style="color: #999999; font-size: 13px; margin: 0; text-align: center;">
                This is a confirmation email from ${escapeHtml(organizationName)}.<br>
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
