import { Resend } from 'resend';
import { env } from '../config/env.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.SMTP_FROM_EMAIL || 'noreply@kourti.com';
const APP_URL = process.env.APP_URL || env.APP_URL || 'https://app.kourti.com';
const BRAND_NAME = 'Kourti AI';
const LOGO_URL = `${APP_URL}/kourti-light-full.png`;

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

// ── Brand colours ───────────────────────────────────────────────────────────

const BRAND = {
  primary: '#4B7FD6',
  primaryLight: '#79A5EA',
  accent: '#AFC8F0',
  dark: '#09090B',
  darkSurface: '#111318',
  lightBg: '#F2F5F9',
  lightText: '#1A2137',
  mutedText: '#6b7280',
  border: '#E5E7EB',
  white: '#FFFFFF',
  success: '#5FB65F',
  warning: '#FFCC00',
  destructive: '#FF4444',
} as const;

// ── Email templates ─────────────────────────────────────────────────────────

function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${title}</title></head>
<body style="margin:0;padding:0;background:${BRAND.lightBg};font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.lightBg};padding:40px 0;">
<tr><td align="center">

<!-- Gradient accent bar -->
<table width="600" cellpadding="0" cellspacing="0" style="border-radius:16px 16px 0 0;overflow:hidden;">
<tr><td style="height:4px;background:linear-gradient(135deg,${BRAND.accent} 0%,${BRAND.primary} 100%);"></td></tr>
</table>

<!-- Main card -->
<table width="600" cellpadding="0" cellspacing="0" style="background:${BRAND.white};border-radius:0 0 16px 16px;border:1px solid ${BRAND.border};border-top:none;">
<tr><td style="padding:40px 48px;">

  <!-- Logo -->
  <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
  <tr><td>
    <a href="${APP_URL}" style="text-decoration:none;">
      <img src="${LOGO_URL}" alt="${BRAND_NAME}" width="140" style="display:block;height:auto;border:0;" />
    </a>
  </td></tr>
  </table>

  <!-- Body content -->
  ${body}

  <!-- Footer -->
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:36px 0 0;border-top:1px solid ${BRAND.border};padding-top:24px;">
  <tr><td>
    <p style="color:${BRAND.mutedText};font-size:12px;line-height:1.5;margin:0;">
      &copy; ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.
    </p>
    <p style="color:${BRAND.mutedText};font-size:11px;line-height:1.5;margin:8px 0 0;">
      <a href="${APP_URL}/settings" style="color:${BRAND.primary};text-decoration:none;">Manage preferences</a>
      &nbsp;&middot;&nbsp;
      <a href="${APP_URL}" style="color:${BRAND.primary};text-decoration:none;">Open ${BRAND_NAME}</a>
    </p>
  </td></tr>
  </table>

</td></tr>
</table>

</td></tr>
</table>
</body></html>`;
}

function ctaButton(text: string, url: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td>
    <a href="${url}" style="display:inline-block;background:${BRAND.primary};color:${BRAND.white};font-size:14px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:100px;letter-spacing:0.5px;">${text}</a>
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

export async function sendEmailOtpEmail(
  email: string,
  code: string,
  purpose: 'login' | 'signup' | 'enable_2fa'
): Promise<{ messageId?: string }> {
  const r = getResend();
  const subjectByPurpose: Record<typeof purpose, string> = {
    login: `Your ${BRAND_NAME} sign-in code`,
    signup: `Verify your email for ${BRAND_NAME}`,
    enable_2fa: `Enable email 2FA for ${BRAND_NAME}`,
  };
  const introByPurpose: Record<typeof purpose, string> = {
    login: 'Use the code below to finish signing in:',
    signup: 'Use the code below to verify your email address and finish creating your account:',
    enable_2fa: 'Use the code below to confirm enabling email two-factor authentication:',
  };

  const html = wrapHtml(
    subjectByPurpose[purpose],
    `
    <p style="color:#374151;font-size:15px;line-height:1.6;">${introByPurpose[purpose]}</p>
    <div style="margin:24px 0;padding:20px 24px;background:${BRAND.lightBg};border:1px solid ${BRAND.border};border-radius:12px;text-align:center;">
      <div style="font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:32px;letter-spacing:8px;font-weight:700;color:${BRAND.dark};">${code}</div>
    </div>
    <p style="color:#6b7280;font-size:13px;">This code expires in 10 minutes and can only be used once.</p>
    <p style="color:#6b7280;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
    `
  );

  const { data, error } = await r.emails.send({
    from: `${BRAND_NAME} <${FROM_EMAIL}>`,
    to: [email.toLowerCase()],
    subject: subjectByPurpose[purpose],
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
    <p style="color:${BRAND.lightText};font-size:15px;line-height:1.6;">Hi,</p>
    <p style="color:${BRAND.lightText};font-size:15px;line-height:1.6;">${message}</p>
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

// ── Weekly Insights Digest ─────────────────────────────────────────────────

export interface WeeklyDigestMetrics {
  firstName?: string;
  weekLabel: string; // e.g. "Mar 31 – Apr 6, 2026"
  activeCases: number;
  newCasesThisWeek: number;
  casesClosedThisWeek: number;
  totalPendingTasks: number;
  tasksCompletedThisWeek: number;
  overdueTasks: number;
  taskCompletionRate: number; // 0–100
  totalClients: number;
  newClientsThisWeek: number;
  documentsUploadedThisWeek: number;
  activeContracts: number;
  contractsExpiringSoon: number; // within next 30 days
  invoicesPaidThisWeek: number;
  revenuePaidThisWeek: number;
  invoicesOverdue: number;
}

function metricCard(
  label: string,
  value: string | number,
  subtext?: string,
  color?: string
): string {
  const valueColor = color || BRAND.lightText;
  return `
  <td width="50%" style="padding:8px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.lightBg};border-radius:12px;padding:20px 16px;">
    <tr><td>
      <p style="color:${BRAND.mutedText};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 8px;">${label}</p>
      <p style="color:${valueColor};font-size:28px;font-weight:700;margin:0;line-height:1.2;">${value}</p>
      ${subtext ? `<p style="color:${BRAND.mutedText};font-size:12px;margin:6px 0 0;">${subtext}</p>` : ''}
    </td></tr>
    </table>
  </td>`;
}

function sectionHeading(text: string): string {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 12px;">
  <tr>
    <td style="width:4px;background:linear-gradient(180deg,${BRAND.accent},${BRAND.primary});border-radius:2px;"></td>
    <td style="padding-left:12px;">
      <p style="color:${BRAND.lightText};font-size:14px;font-weight:700;margin:0;letter-spacing:0.3px;">${text}</p>
    </td>
  </tr>
  </table>`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function changeIndicator(value: number, label: string): string {
  if (value === 0) return `<span style="color:${BRAND.mutedText};">No change</span>`;
  const arrow = value > 0 ? '&#9650;' : '&#9660;';
  const color = value > 0 ? BRAND.success : BRAND.destructive;
  return `<span style="color:${color};font-size:12px;">${arrow} ${Math.abs(value)} ${label}</span>`;
}

export async function sendWeeklyDigestEmail(
  email: string,
  metrics: WeeklyDigestMetrics
): Promise<{ messageId?: string }> {
  const r = getResend();
  const greeting = metrics.firstName ? `Hi ${metrics.firstName}` : 'Hi';

  const body = `
    <!-- Greeting -->
    <p style="color:${BRAND.lightText};font-size:15px;line-height:1.6;margin:0 0 4px;">${greeting},</p>
    <p style="color:${BRAND.mutedText};font-size:14px;line-height:1.6;margin:0 0 8px;">Here's your weekly snapshot for <strong style="color:${BRAND.lightText};">${metrics.weekLabel}</strong></p>

    <!-- Cases -->
    ${sectionHeading('Cases')}
    <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      ${metricCard('Active Cases', metrics.activeCases, changeIndicator(metrics.newCasesThisWeek, 'new this week'))}
      ${metricCard('Closed This Week', metrics.casesClosedThisWeek)}
    </tr>
    </table>

    <!-- Tasks -->
    ${sectionHeading('Tasks')}
    <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      ${metricCard('Completed', metrics.tasksCompletedThisWeek, `${metrics.taskCompletionRate}% completion rate`, BRAND.success)}
      ${metricCard('Pending', metrics.totalPendingTasks, metrics.overdueTasks > 0 ? `${metrics.overdueTasks} overdue` : 'All on track', metrics.overdueTasks > 0 ? BRAND.warning : undefined)}
    </tr>
    </table>

    <!-- Clients & Documents -->
    ${sectionHeading('Clients & Documents')}
    <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      ${metricCard('Total Clients', metrics.totalClients, changeIndicator(metrics.newClientsThisWeek, 'new this week'))}
      ${metricCard('Docs Uploaded', metrics.documentsUploadedThisWeek, 'This week')}
    </tr>
    </table>

    <!-- Contracts -->
    ${sectionHeading('Contracts')}
    <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      ${metricCard('Active Contracts', metrics.activeContracts)}
      ${metricCard('Expiring Soon', metrics.contractsExpiringSoon, 'Within 30 days', metrics.contractsExpiringSoon > 0 ? BRAND.warning : undefined)}
    </tr>
    </table>

    <!-- Revenue -->
    ${sectionHeading('Revenue')}
    <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      ${metricCard('Paid This Week', formatCurrency(metrics.revenuePaidThisWeek), `${metrics.invoicesPaidThisWeek} invoice${metrics.invoicesPaidThisWeek !== 1 ? 's' : ''}`, BRAND.success)}
      ${metricCard('Overdue Invoices', metrics.invoicesOverdue, '', metrics.invoicesOverdue > 0 ? BRAND.destructive : undefined)}
    </tr>
    </table>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0 0;">
    <tr><td align="center">
      ${ctaButton('View Full Dashboard', `${APP_URL}/dashboard`)}
    </td></tr>
    </table>
  `;

  const html = wrapHtml(`Your Weekly Insights — ${metrics.weekLabel}`, body);

  const { data, error } = await r.emails.send({
    from: `${BRAND_NAME} <${FROM_EMAIL}>`,
    to: [email.toLowerCase()],
    subject: `Your Week in Review — ${metrics.weekLabel}`,
    html,
  });

  if (error) throw new Error(error.message);
  return { messageId: data?.id };
}

// ── Marketing-site lead emails ───────────────────────────────────────────────

/** Internal sales recipients for marketing lead notifications. */
const LEADS_NOTIFY_EMAILS = (process.env.LEADS_NOTIFY_EMAILS || 'sales@kourti.com')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** Escape user-supplied text before interpolating into email HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface ContactLead {
  firstName: string;
  lastName: string;
  email: string;
  company?: string | null;
  phone?: string | null;
  firmSize?: string | null;
  interest: string;
  message: string;
}

function leadRow(label: string, value: string | null | undefined): string {
  return `<p style="color:${BRAND.lightText};font-size:14px;line-height:1.6;margin:0 0 6px;">
    <strong>${label}:</strong> ${value ? escapeHtml(value) : 'N/A'}</p>`;
}

/** Notify the sales team of a new contact-form submission. */
export async function sendContactLeadNotification(
  lead: ContactLead
): Promise<{ messageId?: string }> {
  if (LEADS_NOTIFY_EMAILS.length === 0) return {};
  const r = getResend();

  const body = `
    <h2 style="color:${BRAND.lightText};font-size:18px;margin:0 0 16px;">New contact form submission</h2>
    ${leadRow('Name', `${lead.firstName} ${lead.lastName}`)}
    ${leadRow('Email', lead.email)}
    ${leadRow('Company', lead.company)}
    ${leadRow('Phone', lead.phone)}
    ${leadRow('Firm size', lead.firmSize)}
    ${leadRow('Interest', lead.interest)}
    <p style="color:${BRAND.lightText};font-size:14px;line-height:1.6;margin:16px 0 6px;"><strong>Message:</strong></p>
    <p style="color:${BRAND.mutedText};font-size:14px;line-height:1.6;margin:0;white-space:pre-wrap;">${escapeHtml(lead.message)}</p>
  `;

  const { data, error } = await r.emails.send({
    from: `${BRAND_NAME} <${FROM_EMAIL}>`,
    to: LEADS_NOTIFY_EMAILS,
    replyTo: lead.email.toLowerCase(),
    subject: `New contact: ${lead.firstName} ${lead.lastName} — ${lead.interest}`,
    html: wrapHtml('New contact form submission', body),
  });

  if (error) throw new Error(error.message);
  return { messageId: data?.id };
}

export interface AssessmentLead {
  firstName: string;
  lastName: string;
  email: string;
  company?: string | null;
  tier: string;
  totalScore: number;
  maxScore: number;
  dimensionScores: Record<string, number>;
}

const DIMENSION_LABELS: Record<string, string> = {
  legal_research: 'Legal Research Tools',
  document_mgmt: 'Document Management',
  court_filing: 'Court Filing & Compliance',
  ai_adoption: 'AI Adoption',
  cybersecurity: 'Cybersecurity & Data Protection',
  practice_mgmt: 'Practice & Client Management',
};

function dimensionRows(scores: Record<string, number>, perDimensionMax = 4): string {
  return Object.entries(scores)
    .map(([key, score]) => {
      const pct = Math.round((score / perDimensionMax) * 100);
      const label = DIMENSION_LABELS[key] || escapeHtml(key);
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid ${BRAND.border};font-size:14px;color:${BRAND.lightText};">${label}</td>
        <td style="padding:8px 12px;border-bottom:1px solid ${BRAND.border};font-size:14px;color:${BRAND.lightText};text-align:right;">${pct}%</td>
      </tr>`;
    })
    .join('');
}

/** Send the maturity-assessment results to the person who completed it. */
export async function sendAssessmentResultEmail(
  lead: AssessmentLead
): Promise<{ messageId?: string }> {
  const r = getResend();
  const percent = Math.round((lead.totalScore / lead.maxScore) * 100);

  const body = `
    <p style="color:${BRAND.lightText};font-size:15px;line-height:1.6;">Hi ${escapeHtml(lead.firstName)},</p>
    <p style="color:${BRAND.lightText};font-size:15px;line-height:1.6;">Here are your Legal Practice Maturity results.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background:${BRAND.lightBg};border-radius:12px;">
      <tr><td style="padding:20px;text-align:center;">
        <p style="margin:0;color:${BRAND.mutedText};font-size:13px;">Your tier</p>
        <p style="margin:4px 0 0;color:${BRAND.primary};font-size:24px;font-weight:700;">${escapeHtml(lead.tier)}</p>
        <p style="margin:8px 0 0;color:${BRAND.lightText};font-size:15px;">${lead.totalScore}/${lead.maxScore} (${percent}%)</p>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0;">${dimensionRows(lead.dimensionScores)}</table>
    ${ctaButton('Start your free trial', APP_URL)}
  `;

  const { data, error } = await r.emails.send({
    from: `${BRAND_NAME} <${FROM_EMAIL}>`,
    to: [lead.email.toLowerCase()],
    subject: `Your Practice Maturity Results: ${lead.tier} (${lead.totalScore}/${lead.maxScore})`,
    html: wrapHtml('Your Legal Practice Maturity Results', body),
  });

  if (error) throw new Error(error.message);
  return { messageId: data?.id };
}

/** Notify the sales team of a new assessment lead. */
export async function sendAssessmentLeadNotification(
  lead: AssessmentLead
): Promise<{ messageId?: string }> {
  if (LEADS_NOTIFY_EMAILS.length === 0) return {};
  const r = getResend();
  const percent = Math.round((lead.totalScore / lead.maxScore) * 100);

  const body = `
    <h2 style="color:${BRAND.lightText};font-size:18px;margin:0 0 16px;">New assessment lead</h2>
    ${leadRow('Name', `${lead.firstName} ${lead.lastName}`)}
    ${leadRow('Email', lead.email)}
    ${leadRow('Company', lead.company)}
    ${leadRow('Tier', lead.tier)}
    ${leadRow('Score', `${lead.totalScore}/${lead.maxScore} (${percent}%)`)}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0;">${dimensionRows(lead.dimensionScores)}</table>
  `;

  const { data, error } = await r.emails.send({
    from: `${BRAND_NAME} <${FROM_EMAIL}>`,
    to: LEADS_NOTIFY_EMAILS,
    replyTo: lead.email.toLowerCase(),
    subject: `New assessment lead: ${lead.tier} (${lead.totalScore}/${lead.maxScore})`,
    html: wrapHtml('New assessment lead', body),
  });

  if (error) throw new Error(error.message);
  return { messageId: data?.id };
}
