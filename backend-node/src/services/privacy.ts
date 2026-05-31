/**
 * Data-subject rights service (GDPR Art. 15/17/20, NDPR).
 *
 *  - exportUserData / exportClientData  → right of access + portability
 *  - eraseUser / eraseClientUser        → right to erasure
 *
 * Design notes
 * ------------
 * Erasure HARD-DELETES rows that are purely the data subject's own personal
 * data, and ANONYMIZES references in shared / audit / financial tables that
 * we are entitled (or obliged) to keep — e.g. audit logs and payment records
 * under accounting-retention law. We never delete a law firm's own business
 * records (their `clients`, `cases`, `documents`): for a portal client we only
 * unlink the global identity. See docs/compliance/RETENTION_POLICY.md and
 * DSAR_PROCEDURE.md.
 *
 * Every statement is run independently and best-effort: a column that doesn't
 * exist in a given deployment is logged and skipped rather than aborting the
 * whole erasure (over-deletion is acceptable for erasure; a half-applied
 * transaction is not).
 */
import { db } from '../db/pool.js';

const REDACTED = '[erased]';

async function run(label: string, sql: string, params: unknown[]): Promise<void> {
  try {
    await db.query(sql, params);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Missing table/column on this deployment is fine — skip quietly.
    if (!/does not exist|column .* does not exist|relation .* does not exist/i.test(msg)) {
      console.error(`[privacy] ${label} failed: ${msg}`);
    }
  }
}

async function fetch<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: unknown[]
): Promise<T[]> {
  try {
    const res = await db.query<T>(sql, params);
    return res.rows;
  } catch {
    return [];
  }
}

// ── Export (access + portability) ──────────────────────────────────────────

export interface ExportResult {
  generatedAt: string;
  subject: Record<string, unknown>;
  data: Record<string, unknown[]>;
}

/** Assemble a portable copy of everything we hold about a staff user. */
export async function exportUserData(userId: string): Promise<ExportResult> {
  const [account] = await fetch(
    `select id, email, is_active, email_confirmed_at, last_sign_in_at, created_at
       from public.auth_users where id = $1`,
    [userId]
  );
  const [profile] = await fetch(`select * from public.profiles where user_id = $1`, [userId]);

  const data: Record<string, unknown[]> = {
    profile: profile ? [profile] : [],
    consent_history: await fetch(
      `select consent_type, granted, version, source, created_at
         from public.consent_records where subject_id = $1 order by created_at`,
      [userId]
    ),
    ai_conversations: await fetch(
      `select id, title, created_at from public.ai_conversations where user_id = $1`,
      [userId]
    ),
    ai_messages: await fetch(
      `select m.conversation_id, m.role, m.content, m.created_at
         from public.ai_conversation_messages m
         join public.ai_conversations c on c.id = m.conversation_id
        where c.user_id = $1 order by m.created_at`,
      [userId]
    ),
    role_assignments: await fetch(
      `select role_name, organization_id, created_at
         from public.user_role_assignments where user_id = $1`,
      [userId]
    ),
    email_history: await fetch(
      `select template, subject, status, created_at
         from public.email_delivery_log where user_id = $1 order by created_at`,
      [userId]
    ),
    payments: await fetch(
      `select tx_ref, amount, currency, status, created_at
         from public.payment_transactions where user_id = $1 order by created_at`,
      [userId]
    ),
  };

  return {
    generatedAt: new Date().toISOString(),
    subject: account ?? { id: userId },
    data,
  };
}

/** Assemble a portable copy of everything we hold about a portal client. */
export async function exportClientData(clientUserId: string): Promise<ExportResult> {
  const [account] = await fetch(
    `select id, email, full_name, phone, is_active, email_verified_at, last_sign_in_at, created_at
       from public.client_users where id = $1`,
    [clientUserId]
  );

  const data: Record<string, unknown[]> = {
    consent_history: await fetch(
      `select consent_type, granted, version, source, created_at
         from public.consent_records where subject_id = $1 order by created_at`,
      [clientUserId]
    ),
    case_access: await fetch(
      `select case_id, status, created_at from public.client_case_access where client_user_id = $1`,
      [clientUserId]
    ),
    messages: await fetch(
      `select case_id, body, created_at from public.case_client_messages
        where sender_type = 'client' and sender_id = $1 order by created_at`,
      [clientUserId]
    ),
    event_rsvps: await fetch(
      `select calendar_event_id, response, created_at from public.calendar_event_rsvps where client_user_id = $1`,
      [clientUserId]
    ),
  };

  return {
    generatedAt: new Date().toISOString(),
    subject: account ?? { id: clientUserId },
    data,
  };
}

// ── Erasure ──────────────────────────────────────────────────────────────

export interface ErasureResult {
  subjectType: 'user' | 'client_user';
  subjectId: string;
  erasedAt: string;
}

/**
 * Erase a staff user. Hard-deletes their identity + personal content;
 * anonymizes audit/financial references that must be retained.
 */
export async function eraseUser(userId: string): Promise<ErasureResult> {
  // Capture the email up front so we can scrub Brevo + email logs.
  const [u] = await fetch<{ email: string | null }>(
    `select email from public.auth_users where id = $1`,
    [userId]
  );
  const email = u?.email ?? null;

  // 1) Hard-delete the user's own personal content.
  await run(
    'ai_messages',
    `delete from public.ai_conversation_messages where conversation_id in (select id from public.ai_conversations where user_id = $1)`,
    [userId]
  );
  await run('ai_conversations', `delete from public.ai_conversations where user_id = $1`, [userId]);
  await run('onboarding_steps', `delete from public.user_onboarding_steps where user_id = $1`, [
    userId,
  ]);
  await run('role_assignments', `delete from public.user_role_assignments where user_id = $1`, [
    userId,
  ]);
  await run('email_otp', `delete from public.email_otp_codes where user_id = $1`, [userId]);
  await run(
    'conversation_participants',
    `delete from public.conversation_participants where user_id = $1`,
    [userId]
  );

  // 2) Anonymize references we keep for audit / accounting (legal basis:
  //    legitimate interest / legal obligation).
  await run(
    'admin_actions_actor',
    `update public.admin_actions set admin_user_id = null where admin_user_id = $1`,
    [userId]
  );
  await run(
    'admin_actions_target',
    `update public.admin_actions set target_id = null where target_id = $1::text`,
    [userId]
  );
  await run(
    'email_log',
    `update public.email_delivery_log set user_id = null, to_email = $2 where user_id = $1`,
    [userId, REDACTED]
  );
  await run(
    'impersonation_target',
    `update public.impersonation_sessions set target_email = $2 where target_user_id = $1`,
    [userId, REDACTED]
  );
  // Keep financial records (accounting-retention law) but strip email PII.
  await run(
    'payments',
    `update public.payment_transactions set customer_email = $2 where user_id = $1`,
    [userId, REDACTED]
  );
  await run(
    'consent_email',
    `update public.consent_records set email = null where subject_id = $1`,
    [userId]
  );

  // 3) Delete the profile + auth identity last.
  await run('profile', `delete from public.profiles where user_id = $1`, [userId]);
  await run('auth_user', `delete from public.auth_users where id = $1`, [userId]);

  // 4) Best-effort: remove from the marketing CRM.
  if (email) {
    try {
      const { brevoDeleteContact } = await import('./brevo.js');
      await brevoDeleteContact(email).catch(() => undefined);
    } catch {
      /* brevo optional */
    }
  }

  // 5) Tombstone in the consent ledger for accountability.
  await run(
    'erasure_record',
    `insert into public.consent_records (subject_type, subject_id, consent_type, granted, source) values ('user', $1, 'privacy', false, 'erasure')`,
    [userId]
  );

  return { subjectType: 'user', subjectId: userId, erasedAt: new Date().toISOString() };
}

/**
 * Erase a portal client (global identity). Deletes their portal account +
 * personal content; UNLINKS (does not delete) the firms' contact records,
 * which belong to the firm as controller.
 */
export async function eraseClientUser(clientUserId: string): Promise<ErasureResult> {
  const [c] = await fetch<{ email: string | null }>(
    `select email from public.client_users where id = $1`,
    [clientUserId]
  );
  const email = c?.email ?? null;

  await run('client_otp', `delete from public.client_email_otp_codes where client_user_id = $1`, [
    clientUserId,
  ]);
  await run('client_rsvps', `delete from public.calendar_event_rsvps where client_user_id = $1`, [
    clientUserId,
  ]);
  await run(
    'client_messages',
    `update public.case_client_messages set body = $2 where sender_type = 'client' and sender_id = $1`,
    [clientUserId, REDACTED]
  );
  await run(
    'client_case_access',
    `delete from public.client_case_access where client_user_id = $1`,
    [clientUserId]
  );
  await run(
    'client_portal_access',
    `delete from public.client_portal_access where client_user_id = $1`,
    [clientUserId]
  );
  await run(
    'client_digests',
    `update public.client_update_digests set client_user_id = null where client_user_id = $1`,
    [clientUserId]
  );
  // Unlink the firm's contact records (firm = controller; keep the record).
  await run(
    'clients_unlink',
    `update public.clients set client_user_id = null, portal_enabled = false where client_user_id = $1`,
    [clientUserId]
  );
  await run(
    'consent_email',
    `update public.consent_records set email = null where subject_id = $1`,
    [clientUserId]
  );
  await run('client_user', `delete from public.client_users where id = $1`, [clientUserId]);

  if (email) {
    try {
      const { brevoDeleteContact } = await import('./brevo.js');
      await brevoDeleteContact(email).catch(() => undefined);
    } catch {
      /* optional */
    }
  }

  await run(
    'erasure_record',
    `insert into public.consent_records (subject_type, subject_id, consent_type, granted, source) values ('client_user', $1, 'privacy', false, 'erasure')`,
    [clientUserId]
  );

  return {
    subjectType: 'client_user',
    subjectId: clientUserId,
    erasedAt: new Date().toISOString(),
  };
}
