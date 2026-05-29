/**
 * Unverified-user sweep.
 *
 * Onboarding now creates the auth_users row at step 0 (before the OTP
 * step), so a user who abandons the flow leaves behind a row with
 * `email_confirmed_at IS NULL`. Without a sweep these accumulate
 * forever and amplify email-enumeration via the "already registered"
 * signup error.
 *
 * Strategy: every 6 hours, delete auth_users rows where
 *   email_confirmed_at IS NULL AND created_at < now() - 7 days
 * and that have NO associated profile (the profile row is only created
 * by /api/v1/onboarding/complete, which requires a verified session).
 */
import type { Job } from 'pg-boss';

import { db } from '../db/pool.js';
import { getBoss, registerAgentHandler } from '../lib/pgboss.js';

const QUEUE_NAME = 'unverified_user_sweep';
const BATCH_LIMIT = 500;
const STALE_AFTER_DAYS = 7;

registerAgentHandler(QUEUE_NAME, async (_job: Job) => {
  const result = await db.query<{ id: string }>(
    `with stale as (
       select au.id
         from public.auth_users au
         left join public.profiles p on p.user_id = au.id
        where au.email_confirmed_at is null
          and au.created_at < now() - ($1 || ' days')::interval
          and p.user_id is null
        order by au.created_at asc
        limit $2
        for update skip locked
     )
     delete from public.auth_users au
      using stale
      where au.id = stale.id
      returning au.id`,
    [STALE_AFTER_DAYS, BATCH_LIMIT]
  );

  if (result.rows.length > 0) {
    console.log(`[unverified-sweep] Purged ${result.rows.length} stale unverified user(s)`);
  }
});

export async function startUnverifiedUserSweep() {
  const boss = getBoss();

  await boss.createQueue(QUEUE_NAME, {
    retryLimit: 2,
    retryDelay: 120,
    expireInSeconds: 300,
    deleteAfterSeconds: 3600,
  });

  // Every 6 hours at minute 13 (avoid top-of-hour pile-up with other jobs).
  await boss.schedule(QUEUE_NAME, '13 */6 * * *', {}, {});

  console.log('[unverified-sweep] Scheduled every 6h');
}
