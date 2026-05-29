/**
 * Seat accounting + enforcement for seat-based billing.
 *
 * A seat is consumed by an active member (a profiles row in the org) or a
 * pending invitation. The org's purchased seat count lives on its live
 * subscription (`subscriptions.seats`), set at checkout (paid) or at trial
 * start (TRIAL_SEATS). Enforcement blocks new invites once used >= seats.
 */
import type { PoolClient } from 'pg';

import { db } from '../db/pool.js';
import { ApiError } from '../lib/http.js';

export interface SeatUsage {
  /** Active members + pending invitations. */
  used: number;
  /** Seats the org has paid for (or trial allowance). 0 = no live plan. */
  seats: number;
  /** seats - used, floored at 0. */
  available: number;
}

export async function getSeatUsage(orgId: string): Promise<SeatUsage> {
  const [membersRes, invitesRes, subRes] = await Promise.all([
    db.query<{ c: number }>(
      `select count(*)::int as c from public.profiles where organization_id = $1`,
      [orgId]
    ),
    db
      .query<{ c: number }>(
        `select count(*)::int as c from public.invitations
          where organization_id = $1 and status = 'pending'`,
        [orgId]
      )
      .catch(() => ({ rows: [{ c: 0 }] })),
    db.query<{ seats: number }>(
      `select seats from public.subscriptions
        where organization_id = $1 and status in ('active','trialing','past_due')
        order by created_at desc
        limit 1`,
      [orgId]
    ),
  ]);

  const used = Number(membersRes.rows[0]?.c ?? 0) + Number(invitesRes.rows[0]?.c ?? 0);
  const seats = Number(subRes.rows[0]?.seats ?? 0);
  return { used, seats, available: Math.max(0, seats - used) };
}

function seatLimitError(seats: number): ApiError {
  return new ApiError(
    seats === 0
      ? 'Your organization has no active plan. Start a subscription to invite teammates.'
      : `All ${seats} seat(s) are in use. Add seats to invite more teammates.`,
    409,
    'SEAT_LIMIT_REACHED'
  );
}

/**
 * Throw 409 SEAT_LIMIT_REACHED if granting `adding` more seats would exceed
 * the org's purchased seats. Non-transactional — fine for a read-only
 * pre-check, but prefer `assertSeatAvailableTx` when a row is about to be
 * created (it closes the check-then-insert race).
 */
export async function assertSeatAvailable(orgId: string, adding = 1): Promise<void> {
  const { used, seats } = await getSeatUsage(orgId);
  if (used + adding > seats) throw seatLimitError(seats);
}

/**
 * Transactional seat check. Locks the org's live subscription row
 * (`FOR UPDATE`) so concurrent invites serialize: the second caller blocks
 * until the first commits its new invitation, then re-counts against the
 * fresh total. MUST be called inside a transaction (`begin`) on `client`,
 * with the seat-consuming INSERT happening on the SAME client before commit.
 * Closes the TOCTOU race that the read-only `assertSeatAvailable` cannot.
 */
export async function assertSeatAvailableTx(
  client: PoolClient,
  orgId: string,
  adding = 1
): Promise<void> {
  // Acquire the lock first; held until the transaction commits/rolls back.
  await client.query(
    `select id from public.subscriptions
      where organization_id = $1 and status in ('active','trialing','past_due')
      order by created_at desc
      limit 1
      for update`,
    [orgId]
  );

  const usageRes = await client.query<{ members: number; invites: number; seats: number | null }>(
    `select
       (select count(*)::int from public.profiles where organization_id = $1) as members,
       (select count(*)::int from public.invitations
          where organization_id = $1 and status = 'pending') as invites,
       (select seats from public.subscriptions
          where organization_id = $1 and status in ('active','trialing','past_due')
          order by created_at desc limit 1) as seats`,
    [orgId]
  );
  const row = usageRes.rows[0];
  const used = Number(row?.members ?? 0) + Number(row?.invites ?? 0);
  const seats = Number(row?.seats ?? 0);
  if (used + adding > seats) throw seatLimitError(seats);
}
