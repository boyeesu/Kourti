/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-expect-error: Deno module
import { Resend } from 'https://esm.sh/resend@2.0.0';
// @ts-expect-error: Deno module
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { escapeHtml } from './htmlEscape.ts';
import {
  wrapInEmailTemplate,
  buildGreeting,
  buildParagraph,
  buildCtaButton,
  buildInfoBox,
  BRAND,
} from './emailTemplate.ts';

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

    const organizationName: string = org?.name || 'Kourti AI';

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
        <td style="padding: 8px 0; color: ${BRAND.colors.textSecondary}; font-size: 14px;">Amount</td>
        <td style="padding: 8px 0; color: ${BRAND.colors.primary}; font-size: 14px; font-weight: 600; text-align: right;">${escapeHtml(formattedAmount)}</td>
      </tr>`
    : '';

  const refRow = transactionRef
    ? `<tr>
        <td style="padding: 8px 0; color: ${BRAND.colors.textSecondary}; font-size: 14px;">Reference</td>
        <td style="padding: 8px 0; color: ${BRAND.colors.primary}; font-size: 14px; text-align: right; word-break: break-all;">${escapeHtml(transactionRef)}</td>
      </tr>`
    : '';

  const bodyHtml = `
    ${buildGreeting(recipientName)}

    <p style="color: ${BRAND.colors.success}; font-size: 17px; font-weight: 600; margin: 0 0 16px;">
      Plan Successfully ${escapeHtml(action)}
    </p>

    ${buildParagraph(
      `Your <strong>${escapeHtml(planName)}</strong> plan has been successfully ${action.toLowerCase()}. You now have full access to all features included in your plan.`
    )}

    ${buildInfoBox(
      `
      <p style="color: ${BRAND.colors.primary}; font-size: 15px; font-weight: 600; margin: 0 0 10px;">
        Subscription Details
      </p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding: 8px 0; color: ${BRAND.colors.textSecondary}; font-size: 14px;">Plan</td>
          <td style="padding: 8px 0; color: ${BRAND.colors.primary}; font-size: 14px; font-weight: 600; text-align: right;">${escapeHtml(planName)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: ${BRAND.colors.textSecondary}; font-size: 14px;">Billing Cycle</td>
          <td style="padding: 8px 0; color: ${BRAND.colors.primary}; font-size: 14px; font-weight: 600; text-align: right;">${escapeHtml(billingInterval.charAt(0).toUpperCase() + billingInterval.slice(1))} (per ${escapeHtml(periodLabel)})</td>
        </tr>
        ${amountRow}
        ${refRow}
      </table>
    `,
      BRAND.colors.success
    )}

    ${buildCtaButton('Go to Dashboard', `${appUrl}/dashboard`)}

    ${buildParagraph(
      `If you have any questions about your subscription, reach out to us at <a href="mailto:${BRAND.supportEmail}" style="color: ${BRAND.colors.accent}; text-decoration: none;">${BRAND.supportEmail}</a>.`
    )}
  `;

  return wrapInEmailTemplate(bodyHtml, {
    preheader: `Your ${escapeHtml(planName)} plan has been ${action.toLowerCase()}`,
    organizationName,
  });
}
