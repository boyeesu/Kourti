/**
 * Standalone script to send a test weekly digest email.
 * Run: node --env-file=.env scripts/trigger-digest.mjs
 */

import pg from 'pg';
import { Resend } from 'resend';

const TARGET_EMAIL = 'danielesuga@gmail.com';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const FROM_EMAIL = process.env.SMTP_FROM_EMAIL || 'noreply@kourti.com';
const APP_URL = process.env.APP_URL || 'https://app.kourti.com';
const BRAND_NAME = 'Kourti AI';
const LOGO_URL = `${APP_URL}/kourti-light-full.png`;

if (!RESEND_API_KEY) { console.error('Missing RESEND_API_KEY'); process.exit(1); }
if (!DATABASE_URL) { console.error('Missing DATABASE_URL'); process.exit(1); }

const BRAND = {
  primary: '#4B7FD6',
  primaryLight: '#79A5EA',
  accent: '#AFC8F0',
  lightBg: '#F2F5F9',
  lightText: '#1A2137',
  mutedText: '#6b7280',
  border: '#E5E7EB',
  white: '#FFFFFF',
  success: '#5FB65F',
  warning: '#FFCC00',
  destructive: '#FF4444',
};

// ── DB ──────────────────────────────────────────────────────────────

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ── Email helpers ───────────────────────────────────────────────────

function wrapHtml(title, body) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${title}</title></head>
<body style="margin:0;padding:0;background:${BRAND.lightBg};font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.lightBg};padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="border-radius:16px 16px 0 0;overflow:hidden;">
<tr><td style="height:4px;background:linear-gradient(135deg,${BRAND.accent} 0%,${BRAND.primary} 100%);"></td></tr>
</table>
<table width="600" cellpadding="0" cellspacing="0" style="background:${BRAND.white};border-radius:0 0 16px 16px;border:1px solid ${BRAND.border};border-top:none;">
<tr><td style="padding:40px 48px;">
  <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
  <tr><td>
    <a href="${APP_URL}" style="text-decoration:none;">
      <img src="${LOGO_URL}" alt="${BRAND_NAME}" width="140" style="display:block;height:auto;border:0;" />
    </a>
  </td></tr>
  </table>
  ${body}
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:36px 0 0;border-top:1px solid ${BRAND.border};padding-top:24px;">
  <tr><td>
    <p style="color:${BRAND.mutedText};font-size:12px;line-height:1.5;margin:0;">&copy; ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.</p>
    <p style="color:${BRAND.mutedText};font-size:11px;line-height:1.5;margin:8px 0 0;">
      <a href="${APP_URL}/settings" style="color:${BRAND.primary};text-decoration:none;">Manage preferences</a>
      &middot;
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

function ctaButton(text, url) {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td>
    <a href="${url}" style="display:inline-block;background:${BRAND.primary};color:${BRAND.white};font-size:14px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:100px;letter-spacing:0.5px;">${text}</a>
  </td></tr></table>`;
}

function metricCard(label, value, subtext, color) {
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

function sectionHeading(text) {
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

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

function changeIndicator(value, label) {
  if (value === 0) return `<span style="color:${BRAND.mutedText};">No change</span>`;
  const arrow = value > 0 ? '&#9650;' : '&#9660;';
  const color = value > 0 ? BRAND.success : BRAND.destructive;
  return `<span style="color:${color};font-size:12px;">${arrow} ${Math.abs(value)} ${label}</span>`;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log(`Looking up user: ${TARGET_EMAIL}`);

  const userResult = await pool.query(
    `select au.id as user_id, au.email, p.organization_id, p.first_name
     from public.auth_users au
     left join public.profiles p on p.user_id = au.id
     where au.email = $1 limit 1`,
    [TARGET_EMAIL]
  );

  const user = userResult.rows[0];
  if (!user) { console.error('User not found'); process.exit(1); }

  console.log(`Found: ${user.first_name || '(no name)'} — org: ${user.organization_id}`);
  console.log('Gathering metrics...');

  const orgId = user.organization_id;
  const [cases, newCases, closedCases, tasks, clients, newClients, docs, contracts, expiring, paid, overdue] = await Promise.all([
    pool.query(`select count(*)::int as c from public.cases where organization_id = $1 and status not in ('closed','archived')`, [orgId]),
    pool.query(`select count(*)::int as c from public.cases where organization_id = $1 and created_at >= now() - interval '7 days'`, [orgId]),
    pool.query(`select count(*)::int as c from public.cases where organization_id = $1 and status = 'closed' and updated_at >= now() - interval '7 days'`, [orgId]),
    pool.query(`select count(*)::int as total, count(*) filter(where t.completed=true)::int as done, count(*) filter(where t.completed=true and t.updated_at >= now()-interval '7 days')::int as done_week, count(*) filter(where t.completed=false)::int as pending, count(*) filter(where t.completed=false and t.due_date < now())::int as overdue from public.tasks t join public.cases c on c.id = t.case_id where c.organization_id = $1`, [orgId]),
    pool.query(`select count(*)::int as c from public.clients where organization_id = $1`, [orgId]),
    pool.query(`select count(*)::int as c from public.clients where organization_id = $1 and created_at >= now()-interval '7 days'`, [orgId]),
    pool.query(`select count(*)::int as c from public.documents where organization_id = $1 and created_at >= now()-interval '7 days'`, [orgId]),
    pool.query(`select count(*)::int as c from public.contracts where organization_id = $1 and status = 'active'`, [orgId]),
    pool.query(`select count(*)::int as c from public.contracts where organization_id = $1 and status = 'active' and end_date between now() and now()+interval '30 days'`, [orgId]),
    pool.query(`select count(*)::int as c, coalesce(sum(total_amount),0)::numeric as rev from public.invoices where organization_id = $1 and status = 'paid' and updated_at >= now()-interval '7 days'`, [orgId]),
    pool.query(`select count(*)::int as c from public.invoices where organization_id = $1 and status != 'paid' and due_date < now()`, [orgId]),
  ]);

  const t = tasks.rows[0] || {};
  const completionRate = t.total > 0 ? Math.round((t.done / t.total) * 100) : 0;

  const now = new Date();
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const weekLabel = `${fmt(weekAgo)} – ${fmt(now)}, ${now.getFullYear()}`;

  const m = {
    activeCases: cases.rows[0].c,
    newCasesThisWeek: newCases.rows[0].c,
    casesClosedThisWeek: closedCases.rows[0].c,
    tasksCompletedThisWeek: t.done_week || 0,
    totalPendingTasks: t.pending || 0,
    overdueTasks: t.overdue || 0,
    taskCompletionRate: completionRate,
    totalClients: clients.rows[0].c,
    newClientsThisWeek: newClients.rows[0].c,
    documentsUploadedThisWeek: docs.rows[0].c,
    activeContracts: contracts.rows[0].c,
    contractsExpiringSoon: expiring.rows[0].c,
    invoicesPaidThisWeek: paid.rows[0].c,
    revenuePaidThisWeek: Number(paid.rows[0].rev) || 0,
    invoicesOverdue: overdue.rows[0].c,
  };

  console.log('Metrics:', JSON.stringify(m, null, 2));

  const greeting = user.first_name ? `Hi ${user.first_name}` : 'Hi';

  const body = `
    <p style="color:${BRAND.lightText};font-size:15px;line-height:1.6;margin:0 0 4px;">${greeting},</p>
    <p style="color:${BRAND.mutedText};font-size:14px;line-height:1.6;margin:0 0 8px;">Here's your weekly snapshot for <strong style="color:${BRAND.lightText};">${weekLabel}</strong></p>

    ${sectionHeading('Cases')}
    <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      ${metricCard('Active Cases', m.activeCases, changeIndicator(m.newCasesThisWeek, 'new this week'))}
      ${metricCard('Closed This Week', m.casesClosedThisWeek)}
    </tr>
    </table>

    ${sectionHeading('Tasks')}
    <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      ${metricCard('Completed', m.tasksCompletedThisWeek, `${m.taskCompletionRate}% completion rate`, BRAND.success)}
      ${metricCard('Pending', m.totalPendingTasks, m.overdueTasks > 0 ? `${m.overdueTasks} overdue` : 'All on track', m.overdueTasks > 0 ? BRAND.warning : undefined)}
    </tr>
    </table>

    ${sectionHeading('Clients & Documents')}
    <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      ${metricCard('Total Clients', m.totalClients, changeIndicator(m.newClientsThisWeek, 'new this week'))}
      ${metricCard('Docs Uploaded', m.documentsUploadedThisWeek, 'This week')}
    </tr>
    </table>

    ${sectionHeading('Contracts')}
    <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      ${metricCard('Active Contracts', m.activeContracts)}
      ${metricCard('Expiring Soon', m.contractsExpiringSoon, 'Within 30 days', m.contractsExpiringSoon > 0 ? BRAND.warning : undefined)}
    </tr>
    </table>

    ${sectionHeading('Revenue')}
    <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      ${metricCard('Paid This Week', formatCurrency(m.revenuePaidThisWeek), `${m.invoicesPaidThisWeek} invoice${m.invoicesPaidThisWeek !== 1 ? 's' : ''}`, BRAND.success)}
      ${metricCard('Overdue Invoices', m.invoicesOverdue, '', m.invoicesOverdue > 0 ? BRAND.destructive : undefined)}
    </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0 0;">
    <tr><td align="center">
      ${ctaButton('View Full Dashboard', `${APP_URL}/dashboard`)}
    </td></tr>
    </table>
  `;

  const html = wrapHtml(`Your Weekly Insights — ${weekLabel}`, body);

  console.log('Sending digest email...');
  const resend = new Resend(RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: `${BRAND_NAME} <${FROM_EMAIL}>`,
    to: [TARGET_EMAIL],
    subject: `Your Week in Review — ${weekLabel}`,
    html,
  });

  if (error) throw new Error(error.message);
  console.log('Sent! Message ID:', data?.id);
  await pool.end();
}

main().catch(async (err) => {
  console.error('Failed:', err);
  await pool.end();
  process.exit(1);
});
