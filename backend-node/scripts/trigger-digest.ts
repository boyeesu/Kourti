/**
 * One-off script to trigger a weekly digest email for a specific user.
 * Run: npx tsx scripts/trigger-digest.ts
 *
 * This connects to the database, gathers metrics, and sends the digest
 * directly (bypassing pg-boss) so it works without the job queue running.
 */

import '../src/config/env.js';
import { db } from '../src/db/pool.js';
import { sendWeeklyDigestEmail } from '../src/services/email.js';
import { gatherMetrics } from '../src/agents/weeklyDigest.js';

const TARGET_EMAIL = 'danielesuga@gmail.com';

async function main() {
  console.log(`Looking up user: ${TARGET_EMAIL}`);

  const userResult = await db.query(
    `select au.id as user_id, au.email, p.organization_id, p.first_name
     from public.auth_users au
     left join public.profiles p on p.user_id = au.id
     where au.email = $1
     limit 1`,
    [TARGET_EMAIL]
  );

  const user = userResult.rows[0] as
    | {
        user_id: string;
        email: string;
        organization_id: string;
        first_name?: string;
      }
    | undefined;

  if (!user) {
    console.error(`User not found: ${TARGET_EMAIL}`);
    process.exit(1);
  }

  console.log(`Found user: ${user.first_name || '(no name)'} — org: ${user.organization_id}`);
  console.log('Gathering metrics...');

  const metrics = await gatherMetrics(user.organization_id, user.user_id);
  console.log('Metrics:', JSON.stringify(metrics, null, 2));

  console.log('Sending digest email...');
  const result = await sendWeeklyDigestEmail(user.email, {
    firstName: user.first_name,
    ...metrics,
  });

  console.log('Sent! Message ID:', result.messageId);
  await db.end();
}

main().catch(async (err) => {
  console.error('Failed:', err);
  await db.end();
  process.exit(1);
});
