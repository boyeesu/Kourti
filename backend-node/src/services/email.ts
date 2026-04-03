import { Resend } from 'resend';
import { env } from '../config/env.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.SMTP_FROM_EMAIL || 'noreply@kourti.com';
const APP_URL = process.env.APP_URL || env.APP_URL || 'https://app.kourti.com';
const BRAND_NAME = 'Kourti AI';

let resend: Resend | null = null;

function getResend(): Resend {
  if (!resend) {
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    resend = new Resend(RESEND_API_KEY);
  }
  return resend;
}

// ── Email templates ─────────────────────────────────────────────────────────

function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f7f8fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fa;padding:40px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:40px;border:1px solid #e5e7eb;">
<tr><td>
  <h2 style="color:#111827;font-size:22px;margin:0 0 8px;">${BRAND_NAME}</h2>
  ${body}
  <p style="color:#6b7280;font-size:13px;margin:32px 0 0;border-top:1px solid #e5e7eb;padding-top:20px;">
    &copy; ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.
  </p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function ctaButton(text: string, url: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td>
    <a href="${url}" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px;">${text}</a>
  </td></tr></table>`;
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  orgName?: string
): Promise<{ messageId?: string }> {
  const r = getResend();
  const resetUrl = `${APP_URL}/auth/reset-password?token=${resetToken}`;
  const displayName = orgName || BRAND_NAME;

  const html = wrapHtml(
    `Reset Your ${displayName} Password`,
    `
    <p style="color:#374151;font-size:15px;line-height:1.6;">Hi,</p>
    <p style="color:#374151;font-size:15px;line-height:1.6;">We received a request to reset your password for your <strong>${displayName}</strong> account.</p>
    ${ctaButton('Reset Password', resetUrl)}
    <p style="color:#6b7280;font-size:13px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
    <p style="color:#6b7280;font-size:12px;word-break:break-all;">Direct link: ${resetUrl}</p>
    `
  );

  const { data, error } = await r.emails.send({
    from: `${displayName} <${FROM_EMAIL}>`,
    to: [email.toLowerCase()],
    subject: `Reset Your ${displayName} Password`,
    html,
  });

  if (error) throw new Error(error.message);
  return { messageId: data?.id };
}

export async function sendWelcomeEmail(
  email: string,
  firstName?: string
): Promise<{ messageId?: string }> {
  const r = getResend();
  const greeting = firstName ? `Hi ${firstName}` : 'Hi';

  const html = wrapHtml(
    `Welcome to ${BRAND_NAME}!`,
    `
    <p style="color:#374151;font-size:15px;line-height:1.6;">${greeting},</p>
    <p style="color:#374151;font-size:15px;line-height:1.6;">Welcome to <strong>${BRAND_NAME}</strong>! We're excited to have you on board.</p>
    <p style="color:#374151;font-size:15px;line-height:1.6;">Here's what you can do:</p>
    <ul style="color:#374151;font-size:15px;line-height:1.8;">
      <li>Manage your cases and clients</li>
      <li>Use AI-powered contract analysis</li>
      <li>Collaborate with your team</li>
      <li>Track documents and deadlines</li>
    </ul>
    ${ctaButton('Get Started', APP_URL)}
    `
  );

  const { data, error } = await r.emails.send({
    from: `${BRAND_NAME} <${FROM_EMAIL}>`,
    to: [email.toLowerCase()],
    subject: `Welcome to ${BRAND_NAME}!`,
    html,
  });

  if (error) throw new Error(error.message);
  return { messageId: data?.id };
}

export async function sendInvitationEmail(
  email: string,
  inviterName: string,
  orgName: string,
  role?: string,
  options?: {
    invitationUrl?: string;
    token?: string;
  }
): Promise<{ messageId?: string }> {
  const r = getResend();
  const baseUrl = options?.invitationUrl || `${APP_URL}/auth`;
  const separator = baseUrl.includes('?') ? '&' : '?';
  const joinUrl = options?.token
    ? `${baseUrl}${separator}token=${encodeURIComponent(options.token)}&type=invite&email=${encodeURIComponent(email)}&invited=true`
    : `${baseUrl}${separator}invite=true&email=${encodeURIComponent(email)}&invited=true`;

  const html = wrapHtml(
    `You've been invited to ${orgName}`,
    `
    <p style="color:#374151;font-size:15px;line-height:1.6;">Hi,</p>
    <p style="color:#374151;font-size:15px;line-height:1.6;"><strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong>${role ? ` as a <strong>${role}</strong>` : ''} on ${BRAND_NAME}.</p>
    ${ctaButton('Accept Invitation', joinUrl)}
    <p style="color:#6b7280;font-size:13px;">If you don't have an account yet, you'll be able to create one when you click the button above.</p>
    `
  );

  const { data, error } = await r.emails.send({
    from: `${orgName} <${FROM_EMAIL}>`,
    to: [email.toLowerCase()],
    subject: `You've been invited to ${orgName} on ${BRAND_NAME}`,
    html,
  });

  if (error) throw new Error(error.message);
  return { messageId: data?.id };
}

export async function sendNotificationEmail(
  email: string,
  title: string,
  message: string,
  actionUrl?: string,
  actionText?: string
): Promise<{ messageId?: string }> {
  const r = getResend();

  const html = wrapHtml(
    title,
    `
    <p style="color:#374151;font-size:15px;line-height:1.6;">Hi,</p>
    <p style="color:#374151;font-size:15px;line-height:1.6;">${message}</p>
    ${actionUrl ? ctaButton(actionText || 'View Details', actionUrl) : ''}
    `
  );

  const { data, error } = await r.emails.send({
    from: `${BRAND_NAME} <${FROM_EMAIL}>`,
    to: [email.toLowerCase()],
    subject: title,
    html,
  });

  if (error) throw new Error(error.message);
  return { messageId: data?.id };
}
