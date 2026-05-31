/**
 * Platform-admin PER-ORG USAGE & HEALTH DRILL-DOWN (read-only).
 *
 * Mounted (by the integrator) at /api/v1/admin alongside admin.ts. This module
 * owns the `/usage/...` and `/organizations/:orgId/usage` prefixes and must NOT
 * collide with admin.ts which owns /organizations, /organizations/:orgId/plan,
 * and /organizations/:orgId/assign-plan.
 *
 * Everything here is READ-ONLY: no mutations, no audit writes. Every aggregate
 * query is wrapped defensively so a missing/legacy table (e.g. `invoices`, which
 * is referenced by the app but not created in bootstrap.ts) degrades to `null`
 * rather than 500-ing the whole cockpit payload.
 */
import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { asyncHandler } from '../../lib/http.js';
import { requireAdminCapabilityFor } from '../../services/authorization.js';

export const adminUsageRouter = Router();

const orgIdParam = z.object({ orgId: z.string().regex(/^[0-9a-fA-F-]{36}$/) });

/**
 * Run a single-value aggregate (e.g. `select count(*)::int as v ...`) and return
 * the numeric result, or `null` if the table is missing / the query throws.
 * This is how we honour "return null for it rather than a wrong number".
 */
async function safeCount(sql: string, params: unknown[]): Promise<number | null> {
  try {
    const res = await db.query<{ v: number | string | null }>(sql, params);
    const raw = res.rows[0]?.v;
    if (raw == null) return 0;
    const n = typeof raw === 'string' ? Number(raw) : raw;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Boolean "does the org have any rows in this table" probe. Returns false on any
 * failure (missing table etc.) so the flag is conservatively off.
 */
async function safeExists(sql: string, params: unknown[]): Promise<boolean> {
  try {
    const res = await db.query<{ v: boolean }>(sql, params);
    return Boolean(res.rows[0]?.v);
  } catch {
    return false;
  }
}

// ── GET /organizations/:orgId/usage ─────────────────────────────────────────
// Single cockpit payload for one org.
adminUsageRouter.get(
  '/organizations/:orgId/usage',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');
    const { orgId } = orgIdParam.parse(req.params);

    // Organization core record (name etc.). If this fails the whole org likely
    // doesn't exist; we still return a payload with nulls rather than throwing.
    const orgRow = await db
      .query<{
        id: string;
        name: string;
        status: string | null;
        is_active: boolean | null;
        created_at: string;
      }>(
        `select id, name, status, is_active, created_at
           from public.organizations
          where id = $1
          limit 1`,
        [orgId]
      )
      .catch(() => ({ rows: [] as Array<Record<string, never>> }));

    // ── Members (from profiles.status) + last activity across auth_users ──────
    const membersRow = await db
      .query<{
        total: number;
        active: number;
        disabled: number;
        last_active: string | null;
      }>(
        `select
           count(*)::int as total,
           count(*) filter (where p.status = 'active')::int as active,
           count(*) filter (where p.status in ('disabled','deleted'))::int as disabled,
           max(au.last_sign_in_at) as last_active
         from public.profiles p
         left join public.auth_users au on au.id = p.user_id
        where p.organization_id = $1`,
        [orgId]
      )
      .catch(() => ({ rows: [] as Array<Record<string, never>> }));

    const members = membersRow.rows[0] ?? {
      total: null,
      active: null,
      disabled: null,
      last_active: null,
    };

    // ── Subscription: the org's paid subscription + plan display name ─────────
    // subscriptions.organization_id is added via ALTER in bootstrap; join plan.
    const subscriptionRow = await db
      .query<{
        status: string | null;
        billing_interval: string | null;
        current_period_end: string | null;
        plan_name: string | null;
        plan_display_name: string | null;
        plan_type: string | null;
      }>(
        `select
           s.status,
           s.billing_interval,
           s.current_period_end,
           up.name as plan_name,
           up.display_name as plan_display_name,
           up.plan_type
         from public.subscriptions s
         left join public.user_plans up on up.id = s.plan_id
        where s.organization_id = $1
        order by s.created_at desc
        limit 1`,
        [orgId]
      )
      .catch(() => ({ rows: [] as Array<Record<string, never>> }));

    const subscription = subscriptionRow.rows[0] ?? null;

    // ── Counts: each scoped to the org, each in its own try/catch → null ──────
    // Tables WITH a direct organization_id column (confirmed in bootstrap.ts):
    //   documents, cases, clients, contracts, agent_jobs, negotiations,
    //   tabular_reviews, calendar_events. `invoices` is referenced by the app
    //   (invoices router) and is org-scoped there, but is NOT created in
    //   bootstrap.ts — so it may be absent; safeCount returns null in that case.
    const [
      documents,
      cases,
      clients,
      contracts,
      invoices,
      calendar_events,
      agent_jobs,
      negotiations,
      tabular_reviews,
    ] = await Promise.all([
      safeCount(
        `select count(*)::int as v from public.documents where organization_id = $1 and deleted_at is null`,
        [orgId]
      ),
      safeCount(`select count(*)::int as v from public.cases where organization_id = $1`, [orgId]),
      safeCount(`select count(*)::int as v from public.clients where organization_id = $1`, [
        orgId,
      ]),
      safeCount(`select count(*)::int as v from public.contracts where organization_id = $1`, [
        orgId,
      ]),
      // Legacy / possibly-absent table — null on failure rather than wrong number.
      safeCount(`select count(*)::int as v from public.invoices where organization_id = $1`, [
        orgId,
      ]),
      safeCount(
        `select count(*)::int as v from public.calendar_events where organization_id = $1`,
        [orgId]
      ),
      safeCount(`select count(*)::int as v from public.agent_jobs where organization_id = $1`, [
        orgId,
      ]),
      safeCount(`select count(*)::int as v from public.negotiations where organization_id = $1`, [
        orgId,
      ]),
      safeCount(
        `select count(*)::int as v from public.tabular_reviews where organization_id = $1`,
        [orgId]
      ),
    ]);

    // ── Feature usage flags: which automation features have any rows ──────────
    const [has_agents, has_negotiations, has_tabular_reviews] = await Promise.all([
      safeExists(`select exists(select 1 from public.agent_jobs where organization_id = $1) as v`, [
        orgId,
      ]),
      safeExists(
        `select exists(select 1 from public.negotiations where organization_id = $1) as v`,
        [orgId]
      ),
      safeExists(
        `select exists(select 1 from public.tabular_reviews where organization_id = $1) as v`,
        [orgId]
      ),
    ]);

    // ── Storage: sum of documents.file_size (bytes). Null on failure. ─────────
    const storageBytes = await safeCount(
      `select coalesce(sum(file_size), 0)::bigint as v
         from public.documents
        where organization_id = $1
          and deleted_at is null`,
      [orgId]
    );

    res.status(200).json({
      organization: orgRow.rows[0] ?? { id: orgId, name: null, status: null, is_active: null },
      members: {
        total: members.total ?? null,
        active: members.active ?? null,
        disabled: members.disabled ?? null,
        last_active: members.last_active ?? null,
      },
      subscription,
      counts: {
        documents,
        cases,
        clients,
        contracts,
        invoices,
        calendar_events,
        agent_jobs,
        negotiations,
        tabular_reviews,
      },
      features: {
        has_agents,
        has_negotiations,
        has_tabular_reviews,
      },
      storage: {
        documents_bytes: storageBytes,
      },
    });
  })
);

// ── GET /usage/orgs ──────────────────────────────────────────────────────────
// Leaderboards: top orgs by member count and by document count.
adminUsageRouter.get(
  '/usage/orgs',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');

    const byMembers = await db
      .query(
        `select
           o.id as organization_id,
           o.name,
           count(distinct p.user_id)::int as members,
           coalesce((
             select count(*)::int from public.documents d
              where d.organization_id = o.id and d.deleted_at is null
           ), 0) as documents,
           (
             select s.status from public.subscriptions s
              where s.organization_id = o.id
              order by s.created_at desc limit 1
           ) as subscription_status
         from public.organizations o
         left join public.profiles p on p.organization_id = o.id
         group by o.id, o.name
         order by members desc, o.created_at desc
         limit 25`
      )
      .catch(() => ({ rows: [] }));

    const byDocuments = await db
      .query(
        `select
           o.id as organization_id,
           o.name,
           coalesce((
             select count(*)::int from public.profiles p
              where p.organization_id = o.id
           ), 0) as members,
           count(d.id)::int as documents,
           (
             select s.status from public.subscriptions s
              where s.organization_id = o.id
              order by s.created_at desc limit 1
           ) as subscription_status
         from public.organizations o
         left join public.documents d
           on d.organization_id = o.id and d.deleted_at is null
         group by o.id, o.name
         order by documents desc, o.created_at desc
         limit 25`
      )
      .catch(() => ({ rows: [] }));

    res.status(200).json({
      top_by_members: byMembers.rows,
      top_by_documents: byDocuments.rows,
    });
  })
);
