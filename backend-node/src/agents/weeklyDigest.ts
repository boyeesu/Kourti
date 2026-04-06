import type { Job } from 'pg-boss';

import { db } from '../db/pool.js';
import { getBoss, registerAgentHandler } from '../lib/pgboss.js';
import { sendWeeklyDigestEmail } from '../services/email.js';
import type { WeeklyDigestMetrics } from '../services/email.js';

// ── Digest scheduler: runs once per week (Monday 8:00 AM UTC) ──────

registerAgentHandler('weekly_digest_scheduler', async (_job: Job) => {
  // Find all users who have weekly email frequency enabled
  const users = await db.query(
    `select
       np.user_id,
       np.organization_id,
       au.email,
       p.first_name
     from public.notification_preferences np
     join public.auth_users au on au.id = np.user_id
     left join public.profiles p on p.user_id = np.user_id and p.organization_id = np.organization_id
     where np.email_enabled = true
       and np.email_frequency = 'weekly'`
  );

  if (users.rows.length === 0) {
    console.log('[weekly-digest] No users opted in to weekly digest');
    return;
  }

  const boss = getBoss();

  for (const user of users.rows) {
    await boss.send('weekly_digest_send', {
      userId: user.user_id,
      organizationId: user.organization_id,
      email: user.email,
      firstName: user.first_name,
    });
  }

  console.log(`[weekly-digest] Queued ${users.rows.length} digest emails`);
});

// ── Individual digest sender ────────────────────────────────────────

registerAgentHandler('weekly_digest_send', async (job: Job) => {
  const raw = job.data as Record<string, unknown> | undefined;
  if (
    !raw ||
    typeof raw.userId !== 'string' ||
    typeof raw.organizationId !== 'string' ||
    typeof raw.email !== 'string'
  ) {
    console.error('[weekly-digest] Invalid job payload:', JSON.stringify(raw)?.slice(0, 200));
    return;
  }

  const { userId, organizationId, email, firstName } = raw as {
    userId: string;
    organizationId: string;
    email: string;
    firstName?: string;
  };

  const metrics = await gatherMetrics(organizationId, userId);

  try {
    await sendWeeklyDigestEmail(email, {
      firstName: (firstName as string) || undefined,
      ...metrics,
    });
    console.log(`[weekly-digest] Sent to ${email.slice(0, 3)}***`);
  } catch (err) {
    console.error(
      `[weekly-digest] Failed for user ${userId.slice(0, 8)}...:`,
      err instanceof Error ? err.message : err
    );
  }
});

// ── Metrics aggregation ─────────────────────────────────────────────

function getWeekLabel(): string {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return `${fmt(weekAgo)} – ${fmt(now)}, ${now.getFullYear()}`;
}

async function gatherMetrics(
  orgId: string,
  _userId: string
): Promise<Omit<WeeklyDigestMetrics, 'firstName'>> {
  const weekLabel = getWeekLabel();

  // Run all queries in parallel
  const [
    casesResult,
    newCasesResult,
    closedCasesResult,
    tasksResult,
    clientsResult,
    newClientsResult,
    docsResult,
    contractsResult,
    expiringContractsResult,
    paidInvoicesResult,
    overdueInvoicesResult,
  ] = await Promise.all([
    // Active cases
    db.query(
      `select count(*)::int as count from public.cases
       where organization_id = $1 and status not in ('closed', 'archived')`,
      [orgId]
    ),
    // New cases this week
    db.query(
      `select count(*)::int as count from public.cases
       where organization_id = $1 and created_at >= now() - interval '7 days'`,
      [orgId]
    ),
    // Cases closed this week
    db.query(
      `select count(*)::int as count from public.cases
       where organization_id = $1 and status = 'closed' and updated_at >= now() - interval '7 days'`,
      [orgId]
    ),
    // Tasks summary
    db.query(
      `select
         count(*)::int as total,
         count(*) filter (where completed = true)::int as completed_total,
         count(*) filter (where completed = true and updated_at >= now() - interval '7 days')::int as completed_week,
         count(*) filter (where completed = false)::int as pending,
         count(*) filter (where completed = false and due_date < now())::int as overdue
       from public.tasks
       where organization_id = $1`,
      [orgId]
    ),
    // Total clients
    db.query(
      `select count(*)::int as count from public.clients
       where organization_id = $1`,
      [orgId]
    ),
    // New clients this week
    db.query(
      `select count(*)::int as count from public.clients
       where organization_id = $1 and created_at >= now() - interval '7 days'`,
      [orgId]
    ),
    // Documents uploaded this week
    db.query(
      `select count(*)::int as count from public.documents
       where organization_id = $1 and created_at >= now() - interval '7 days'`,
      [orgId]
    ),
    // Active contracts
    db.query(
      `select count(*)::int as count from public.contracts
       where organization_id = $1 and status = 'active'`,
      [orgId]
    ),
    // Contracts expiring within 30 days
    db.query(
      `select count(*)::int as count from public.contracts
       where organization_id = $1
         and status = 'active'
         and end_date between now() and now() + interval '30 days'`,
      [orgId]
    ),
    // Invoices paid this week
    db.query(
      `select
         count(*)::int as count,
         coalesce(sum(total_amount), 0)::numeric as revenue
       from public.invoices
       where organization_id = $1
         and status = 'paid'
         and updated_at >= now() - interval '7 days'`,
      [orgId]
    ),
    // Overdue invoices
    db.query(
      `select count(*)::int as count from public.invoices
       where organization_id = $1
         and status != 'paid'
         and due_date < now()`,
      [orgId]
    ),
  ]);

  const tasks = tasksResult.rows[0] || {};
  const total = tasks.total || 0;
  const completedTotal = tasks.completed_total || 0;
  const completionRate = total > 0 ? Math.round((completedTotal / total) * 100) : 0;

  return {
    weekLabel,
    activeCases: casesResult.rows[0]?.count || 0,
    newCasesThisWeek: newCasesResult.rows[0]?.count || 0,
    casesClosedThisWeek: closedCasesResult.rows[0]?.count || 0,
    totalPendingTasks: tasks.pending || 0,
    tasksCompletedThisWeek: tasks.completed_week || 0,
    overdueTasks: tasks.overdue || 0,
    taskCompletionRate: completionRate,
    totalClients: clientsResult.rows[0]?.count || 0,
    newClientsThisWeek: newClientsResult.rows[0]?.count || 0,
    documentsUploadedThisWeek: docsResult.rows[0]?.count || 0,
    activeContracts: contractsResult.rows[0]?.count || 0,
    contractsExpiringSoon: expiringContractsResult.rows[0]?.count || 0,
    invoicesPaidThisWeek: paidInvoicesResult.rows[0]?.count || 0,
    revenuePaidThisWeek: Number(paidInvoicesResult.rows[0]?.revenue) || 0,
    invoicesOverdue: overdueInvoicesResult.rows[0]?.count || 0,
  };
}

// ── Start the weekly digest scheduler ───────────────────────────────

export async function startWeeklyDigestScheduler() {
  const boss = getBoss();

  await boss.createQueue('weekly_digest_scheduler', {
    retryLimit: 1,
    expireInSeconds: 300,
    deleteAfterSeconds: 86_400,
  });
  await boss.createQueue('weekly_digest_send', {
    retryLimit: 2,
    retryDelay: 60,
    expireInSeconds: 120,
    deleteAfterSeconds: 86_400,
  });

  // Every Monday at 8:00 AM UTC
  await boss.schedule('weekly_digest_scheduler', '0 8 * * 1', {}, {});

  console.log('[weekly-digest] Scheduled every Monday 8:00 AM UTC');
}

// ── Manual trigger (for API endpoint) ───────────────────────────────

export async function triggerDigestForUser(
  userId: string,
  organizationId: string,
  email: string,
  firstName?: string
): Promise<void> {
  const boss = getBoss();
  await boss.send('weekly_digest_send', {
    userId,
    organizationId,
    email,
    firstName,
  });
}

export { gatherMetrics };
