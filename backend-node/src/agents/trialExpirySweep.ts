/**
 * Trial expiry sweep.
 *
 * Runs hourly. Finds trialing subscriptions whose `trial_ends_at` has
 * passed, flips them to `expired`, and pushes the lifecycle change to
 * Brevo so marketing can fire win-back / convert-now campaigns against
 * the `SUB_STATUS = expired` segment.
 *
 * Schema note: `subscriptions.status` is a free text column today (no
 * check constraint — see bootstrap.ts). 'expired' is a Kourti-side value;
 * if a payment provider is added later, decide whether to keep it
 * distinct from provider-emitted statuses.
 */
import type { Job } from 'pg-boss';

import { db } from '../db/pool.js';
import { getBoss, registerAgentHandler } from '../lib/pgboss.js';
import { brevoSyncTrialExpired, logBrevoError } from '../services/brevo.js';

const QUEUE_NAME = 'trial_expiry_sweep';
const BATCH_LIMIT = 200;

interface ExpiringRow {
  id: string;
  organization_id: string;
  user_id: string | null;
  trial_ends_at: string | null;
  email: string | null;
}

registerAgentHandler(QUEUE_NAME, async (_job: Job) => {
  // Bound the UPDATE itself via a FOR UPDATE SKIP LOCKED subquery so the
  // batch limit applies to writes, not just to the rows we read back. This
  // also partitions work safely across concurrent workers — each picks a
  // disjoint slice instead of contending on the same rows.
  const result = await db.query<ExpiringRow>(
    `with due as (
       select id
         from public.subscriptions
        where status = 'trialing'
          and trial_ends_at is not null
          and trial_ends_at <= now()
        order by trial_ends_at asc
        limit $1
        for update skip locked
     ),
     expired as (
       update public.subscriptions s
          set status = 'expired',
              updated_at = now()
         from due
        where s.id = due.id
        returning s.id, s.organization_id, s.user_id, s.trial_ends_at
     )
     select e.id,
            e.organization_id,
            e.user_id,
            e.trial_ends_at,
            coalesce(p.email, au.email) as email
       from expired e
       left join public.auth_users au on au.id = e.user_id
       left join public.profiles p on p.user_id = e.user_id`,
    [BATCH_LIMIT]
  );

  if (result.rows.length === 0) {
    return;
  }

  console.log(`[trial-expiry] Expired ${result.rows.length} trial(s)`);

  for (const row of result.rows) {
    if (!row.email) continue;
    try {
      await brevoSyncTrialExpired(row.email);
    } catch (err) {
      logBrevoError(err);
    }
  }
});

export async function startTrialExpirySweep() {
  const boss = getBoss();

  await boss.createQueue(QUEUE_NAME, {
    retryLimit: 2,
    retryDelay: 120,
    expireInSeconds: 300,
    deleteAfterSeconds: 3600,
  });

  // Hourly is fine — trial granularity is days. Cron at minute 7 to avoid
  // pile-up on the same wallclock minute as every other top-of-hour job.
  await boss.schedule(QUEUE_NAME, '7 * * * *', {}, {});

  console.log('[trial-expiry] Scheduled hourly');
}
