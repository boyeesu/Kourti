/**
 * Lifecycle automation rules runner.
 *
 * Evaluates rows in public.admin_lifecycle_rules and applies their action to
 * the matching entities, writing one public.admin_actions row per affected
 * entity (admin_user_id = the rule's created_by, action_type
 * `rule.auto.<action>`). It is pure DB + adminAudit — no external calls — so it
 * is safe to run from a cron, a manual admin "Run now" button, or a unit test.
 *
 * ── How to schedule (WITHOUT editing server.ts) ────────────────────────────
 * The codebase schedules background work with pg-boss (see
 * src/agents/unverifiedUserSweep.ts, trialExpirySweep.ts). To run lifecycle
 * rules on a cron, add a tiny agent module and call its start function from the
 * existing agent-bootstrap site (the same place startUnverifiedUserSweep() is
 * invoked). Example agent module (NEW file, e.g. src/agents/lifecycleRules.ts):
 *
 *     import type { Job } from 'pg-boss';
 *     import { getBoss, registerAgentHandler } from '../lib/pgboss.js';
 *     import { runLifecycleRules } from '../services/adminRules.js';
 *     const QUEUE = 'lifecycle_rules';
 *     registerAgentHandler(QUEUE, async (_job: Job) => { await runLifecycleRules(); });
 *     export async function startLifecycleRules() {
 *       const boss = getBoss();
 *       await boss.createQueue(QUEUE, { retryLimit: 2, retryDelay: 120, expireInSeconds: 600 });
 *       await boss.schedule(QUEUE, '21 (slash)1 * * *', {}, {}); // hourly, off the top of the hour (use a real cron, e.g. minute 21 every hour)
 *     }
 *
 * Then have the integrator add ONE line at the agent-bootstrap site:
 *     await startLifecycleRules();
 *
 * Or, if pg-boss isn't desired, a plain setInterval in the server bootstrap:
 *     setInterval(() => { runLifecycleRules().catch((e) => console.error(e)); }, 60 * 60 * 1000);
 */
import { db } from '../db/pool.js';
import { recordAdminAction } from './adminAudit.js';

/** Max entities a single rule will touch per run, to bound a runaway match. */
const BATCH_LIMIT = 500;

export type LifecycleTrigger = 'user_signup' | 'dormant_account' | 'trial_expiring';
export type LifecycleAction = 'auto_approve' | 'flag' | 'auto_disable' | 'notify';

export interface LifecycleRuleRow {
  id: string;
  name: string;
  trigger: LifecycleTrigger;
  action: LifecycleAction;
  params: Record<string, unknown>;
  enabled: boolean;
  created_by: string | null;
  last_run_at: string | null;
}

export interface RuleRunResult {
  ruleId: string;
  action: string;
  affected: number;
}

/** Which actions are valid for which trigger (also enforced at the route layer). */
export const TRIGGER_ACTIONS: Record<LifecycleTrigger, LifecycleAction[]> = {
  user_signup: ['auto_approve', 'flag'],
  dormant_account: ['flag', 'auto_disable'],
  trial_expiring: ['notify'],
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

function asPositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

/**
 * Apply a single rule. Returns the number of entities affected. Records one
 * admin_actions row per affected entity and stamps last_run_at on the rule.
 * Throws on DB error — callers decide whether to swallow (batch run) or surface
 * (single-rule "Run now").
 */
export async function runSingleRule(rule: LifecycleRuleRow): Promise<number> {
  const adminId = rule.created_by;
  const params = rule.params ?? {};
  let affected = 0;

  if (rule.trigger === 'user_signup' && rule.action === 'auto_approve') {
    // Approve pending profiles whose email domain matches params.domains.
    // Reuses the approve SQL from routes/api/admin.ts (profiles → active,
    // auth_users → active). Domains are matched case-insensitively on the
    // substring after '@'.
    const domains = asStringArray(params.domains).map((d) => d.toLowerCase());
    if (domains.length === 0) return 0;

    const candidates = await db.query<{ user_id: string; email: string | null }>(
      `select p.user_id, p.email
         from public.profiles p
        where p.status = 'pending'
          and p.email is not null
          and lower(split_part(p.email, '@', 2)) = any($1::text[])
        order by p.created_at asc
        limit $2`,
      [domains, BATCH_LIMIT]
    );

    for (const row of candidates.rows) {
      await db.query(
        `update public.profiles
            set status = 'active', approved_at = now(), approved_by = $1, updated_at = now()
          where user_id = $2`,
        [adminId, row.user_id]
      );
      await db.query(
        `update public.auth_users set is_active = true, updated_at = now() where id = $1`,
        [row.user_id]
      );
      await recordAdminAction({
        adminUserId: adminId ?? row.user_id,
        actionType: 'rule.auto.auto_approve',
        targetType: 'user',
        targetId: row.user_id,
        details: { ruleId: rule.id, ruleName: rule.name, email: row.email, domains },
        before: { status: 'pending' },
        after: { status: 'active' },
      });
      affected++;
    }
  } else if (
    rule.trigger === 'dormant_account' &&
    (rule.action === 'flag' || rule.action === 'auto_disable')
  ) {
    // Users whose last sign-in is older than params.days. flag = record only;
    // auto_disable = disable (profiles → disabled, auth_users → inactive),
    // mirroring routes/api/admin.ts /users/:userId/disable.
    const days = asPositiveInt(params.days, 90);

    const candidates = await db.query<{
      user_id: string;
      email: string | null;
      last_sign_in_at: string | null;
    }>(
      `select au.id as user_id, au.email, au.last_sign_in_at
         from public.auth_users au
         join public.profiles p on p.user_id = au.id
        where au.last_sign_in_at is not null
          and au.last_sign_in_at < now() - make_interval(days => $1::int)
          and au.is_active = true
          and p.status not in ('disabled', 'deleted')
        order by au.last_sign_in_at asc
        limit $2`,
      [days, BATCH_LIMIT]
    );

    for (const row of candidates.rows) {
      if (rule.action === 'auto_disable') {
        await db.query(
          `update public.profiles
              set status = 'disabled', disabled_at = now(), disabled_by = $1, updated_at = now()
            where user_id = $2`,
          [adminId, row.user_id]
        );
        await db.query(
          `update public.auth_users
              set is_active = false, refresh_token = null, updated_at = now()
            where id = $1`,
          [row.user_id]
        );
      }
      await recordAdminAction({
        adminUserId: adminId ?? row.user_id,
        actionType: `rule.auto.${rule.action}`,
        targetType: 'user',
        targetId: row.user_id,
        details: {
          ruleId: rule.id,
          ruleName: rule.name,
          email: row.email,
          days,
          lastSignInAt: row.last_sign_in_at,
        },
        before: rule.action === 'auto_disable' ? { status: 'active', is_active: true } : undefined,
        after:
          rule.action === 'auto_disable' ? { status: 'disabled', is_active: false } : undefined,
      });
      affected++;
    }
  } else if (rule.trigger === 'trial_expiring' && rule.action === 'notify') {
    // Trialing subscriptions whose current_period_end falls within params.days.
    // Email delivery is out of scope here — we just record a notify action per
    // org so the trail captures who would be notified.
    const days = asPositiveInt(params.days, 7);

    const candidates = await db.query<{
      organization_id: string | null;
      current_period_end: string | null;
    }>(
      `select s.organization_id, s.current_period_end
         from public.subscriptions s
        where s.status = 'trialing'
          and s.current_period_end is not null
          and s.current_period_end >= now()
          and s.current_period_end <= now() + make_interval(days => $1::int)
        order by s.current_period_end asc
        limit $2`,
      [days, BATCH_LIMIT]
    );

    for (const row of candidates.rows) {
      await recordAdminAction({
        adminUserId: adminId ?? '00000000-0000-0000-0000-000000000000',
        actionType: 'rule.auto.notify',
        targetType: 'organization',
        targetId: row.organization_id,
        details: {
          ruleId: rule.id,
          ruleName: rule.name,
          days,
          currentPeriodEnd: row.current_period_end,
          note: 'trial_expiring notification (email delivery out of scope)',
        },
      });
      affected++;
    }
  } else {
    // Trigger/action combination not supported — treat as a no-op rather than
    // throwing, so a misconfigured row can't wedge a batch run.
    return 0;
  }

  await db.query(`update public.admin_lifecycle_rules set last_run_at = now() where id = $1`, [
    rule.id,
  ]);

  return affected;
}

/** Load one enabled-or-not rule by id (used by the single-rule "Run now"). */
export async function loadRule(id: string): Promise<LifecycleRuleRow | null> {
  const result = await db.query<LifecycleRuleRow>(
    `select id, name, trigger, action, params, enabled, created_by, last_run_at
       from public.admin_lifecycle_rules
      where id = $1
      limit 1`,
    [id]
  );
  return result.rows[0] ?? null;
}

/**
 * Run every ENABLED rule. Each rule is wrapped in its own try/catch so a single
 * failure (bad params, transient DB error) doesn't abort the rest of the batch.
 */
export async function runLifecycleRules(): Promise<RuleRunResult[]> {
  const rules = await db.query<LifecycleRuleRow>(
    `select id, name, trigger, action, params, enabled, created_by, last_run_at
       from public.admin_lifecycle_rules
      where enabled = true
      order by created_at asc`
  );

  const results: RuleRunResult[] = [];
  for (const rule of rules.rows) {
    try {
      const affected = await runSingleRule(rule);
      results.push({ ruleId: rule.id, action: rule.action, affected });
    } catch (err) {
      console.error(
        '[lifecycle-rules] rule failed:',
        rule.id,
        rule.name,
        err instanceof Error ? err.message : err
      );
      results.push({ ruleId: rule.id, action: rule.action, affected: 0 });
    }
  }
  return results;
}
