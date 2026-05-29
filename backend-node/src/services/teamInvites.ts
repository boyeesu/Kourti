/**
 * Auto-invite teammates after a successful seat purchase.
 *
 * The buyer enters teammate emails at checkout; we stash them in the payment
 * transaction's metadata and, once the charge is confirmed, fire the invites
 * here. Mirrors the invitation creation in routes/api/invitations.ts (stores
 * the sha256 of the token, emails the raw token).
 *
 * Best-effort: a failed email send or row write is logged and skipped — it
 * never throws, so a paid-for subscription is never rolled back by an email
 * hiccup.
 */
import crypto from 'node:crypto';

import { db } from '../db/pool.js';
import { env } from '../config/env.js';
import { sendInvitationEmail } from './email.js';

export async function inviteEmailsForOrg(
  orgId: string,
  emails: string[],
  invitedBy: string | null,
  opts?: { inviterName?: string; organizationName?: string }
): Promise<{ invited: number }> {
  const clean = Array.from(
    new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => e.length > 0))
  );
  if (clean.length === 0) return { invited: 0 };

  let organizationName = opts?.organizationName;
  if (!organizationName) {
    const orgRes = await db
      .query<{
        name: string;
      }>(`select name from public.organizations where id = $1 limit 1`, [orgId])
      .catch(() => ({ rows: [] as { name: string }[] }));
    organizationName = orgRes.rows[0]?.name ?? 'your organization';
  }
  const inviterName = opts?.inviterName ?? 'Your team';
  const invitationUrl = `${env.APP_URL ?? 'https://app.kourti.com'}/auth`;

  let invited = 0;
  for (const email of clean) {
    try {
      // Already a member — nothing to invite.
      const member = await db.query(
        `select 1 from public.profiles where organization_id = $1 and lower(email) = $2 limit 1`,
        [orgId, email]
      );
      if (member.rows[0]) continue;

      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const existing = await db.query<{ id: string }>(
        `select id from public.invitations
          where organization_id = $1 and lower(email) = $2 and status = 'pending'
          order by created_at desc limit 1`,
        [orgId, email]
      );

      if (existing.rows[0]) {
        await db.query(
          `update public.invitations
              set token = $1, expires_at = $2, status = 'pending',
                  invited_by = coalesce($3, invited_by), updated_at = now()
            where id = $4`,
          [tokenHash, expiresAt, invitedBy, existing.rows[0].id]
        );
      } else {
        await db.query(
          `insert into public.invitations
             (email, first_name, last_name, role, department, organization_id,
              invited_by, token, expires_at, status, created_at, updated_at)
           values ($1, $2, 'User', 'user', null, $3, $4, $5, $6, 'pending', now(), now())`,
          [email, email.split('@')[0], orgId, invitedBy, tokenHash, expiresAt]
        );
      }

      try {
        await sendInvitationEmail(email, inviterName, organizationName, 'user', {
          invitationUrl,
          token,
        });
      } catch (err) {
        console.error(
          '[teamInvites] email send failed',
          email,
          err instanceof Error ? err.message : err
        );
      }
      invited++;
    } catch (err) {
      console.error('[teamInvites] invite failed', email, err instanceof Error ? err.message : err);
    }
  }
  return { invited };
}
