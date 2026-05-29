import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { requirePlatformAdminUser } from '../../services/authorization.js';
import { deleteFile, fileExists } from '../../services/storage.js';

const adminActionQuerySchema = z.object({
  admin_user_id: z.string().uuid().optional(),
  action_type: z.string().trim().optional(),
  target_type: z.string().trim().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

const logAdminActionBodySchema = z.object({
  action_type: z.string().trim().min(1),
  target_type: z.string().trim().min(1),
  target_id: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  user_agent: z.string().optional(),
});

export const adminRouter = Router();

adminRouter.get(
  '/actions',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    await requirePlatformAdminUser(auth.userId);

    const filters = adminActionQuerySchema.parse(req.query);

    const whereClauses: string[] = [];
    const values: unknown[] = [];

    if (filters.admin_user_id) {
      values.push(filters.admin_user_id);
      whereClauses.push(`admin_user_id = $${values.length}`);
    }
    if (filters.action_type) {
      values.push(filters.action_type);
      whereClauses.push(`action_type = $${values.length}`);
    }
    if (filters.target_type) {
      values.push(filters.target_type);
      whereClauses.push(`target_type = $${values.length}`);
    }
    if (filters.start_date) {
      values.push(filters.start_date);
      whereClauses.push(`created_at >= $${values.length}`);
    }
    if (filters.end_date) {
      values.push(filters.end_date);
      whereClauses.push(`created_at <= $${values.length}`);
    }

    const whereSql = whereClauses.length ? `where ${whereClauses.join(' and ')}` : '';

    const result = await db.query(
      `
      select *
      from public.admin_actions
      ${whereSql}
      order by created_at desc
      limit 1000
      `,
      values
    );

    res.status(200).json(result.rows);
  })
);

adminRouter.post(
  '/actions',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    await requirePlatformAdminUser(auth.userId);

    const parsed = logAdminActionBodySchema.parse(req.body);

    const result = await db.query(
      `
      insert into public.admin_actions (
        admin_user_id,
        action_type,
        target_type,
        target_id,
        details,
        ip_address,
        user_agent
      )
      values ($1, $2, $3, $4, $5::jsonb, $6, $7)
      returning *
      `,
      [
        auth.userId,
        parsed.action_type,
        parsed.target_type,
        parsed.target_id || null,
        JSON.stringify(parsed.details || {}),
        req.ip || null,
        parsed.user_agent || req.get('user-agent') || null,
      ]
    );

    res.status(201).json(result.rows[0]);
  })
);

// ── User plan assignments ───────────────────────────────────────────────────

adminRouter.get(
  '/user-plan-assignments',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);

    const result = await db
      .query(
        `SELECT upa.*, up.name as plan_name, up.display_name as plan_display_name,
              au.email as user_email
       FROM public.user_plan_assignments upa
       LEFT JOIN public.user_plans up ON up.id = upa.plan_id
       LEFT JOIN public.auth_users au ON au.id = upa.user_id
       ORDER BY upa.created_at DESC`
      )
      .catch(() => ({ rows: [] }));

    res.status(200).json(result.rows);
  })
);

adminRouter.post(
  '/user-plans/assign',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);
    const body = z
      .object({
        userId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
        planId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
        notes: z.string().optional(),
      })
      .parse(req.body);

    const result = await db.query(
      `INSERT INTO public.user_plan_assignments (user_id, plan_id, assigned_by, status, starts_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'active', now(), now(), now())
       RETURNING *`,
      [body.userId, body.planId, req.auth!.userId]
    );

    res.status(201).json(result.rows[0]);
  })
);

adminRouter.post(
  '/user-plans/revoke',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);
    const body = z
      .object({
        userId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
      })
      .parse(req.body);

    await db.query(
      `UPDATE public.user_plan_assignments SET status = 'revoked', updated_at = now() WHERE user_id = $1 AND status = 'active'`,
      [body.userId]
    );

    res.status(200).json({ ok: true });
  })
);

// ── Org-wide plan assignment ────────────────────────────────────────────────
// Assign a plan to an ENTIRE organization in one action. Implemented as a
// per-user grant (one user_plan_assignments row per current member, all tagged
// with the org) rather than touching the paid `subscriptions` row — this is the
// manual / comp grant path, separate from Paystack billing.

const orgIdParam = z.object({ orgId: z.string().regex(/^[0-9a-fA-F-]{36}$/) });

// Current org-wide assignment summary: the plan most recently granted to the
// org's members, plus how many of them currently hold it.
adminRouter.get(
  '/organizations/:orgId/plan',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);
    const { orgId } = orgIdParam.parse(req.params);

    const result = await db
      .query(
        `with members as (
           select user_id from public.profiles where organization_id = $1
         ),
         active as (
           select upa.plan_id, upa.expires_at, upa.starts_at, upa.notes, upa.user_id
             from public.user_plan_assignments upa
             join members m on m.user_id = upa.user_id
            where upa.status = 'active'
         )
         select
           up.id as plan_id,
           up.display_name as plan_display_name,
           up.plan_type,
           count(distinct a.user_id)::int as assigned_users,
           (select count(*)::int from members) as total_users,
           max(a.expires_at) as expires_at,
           max(a.starts_at) as assigned_at
         from active a
         join public.user_plans up on up.id = a.plan_id
         group by up.id, up.display_name, up.plan_type
         order by assigned_users desc, assigned_at desc
         limit 1`,
        [orgId]
      )
      .catch(() => ({ rows: [] }));

    res.status(200).json(result.rows[0] ?? null);
  })
);

adminRouter.post(
  '/organizations/:orgId/assign-plan',
  asyncHandler(async (req, res) => {
    const adminId = req.auth!.userId;
    await requirePlatformAdminUser(adminId);
    const { orgId } = orgIdParam.parse(req.params);
    const body = z
      .object({
        planId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
        // null/omitted → no expiry (open-ended comp grant).
        expiresAt: z.string().datetime().nullish(),
        notes: z.string().max(1000).optional(),
      })
      .parse(req.body);

    // Plan must exist and be active.
    const planRes = await db.query<{ id: string }>(
      `select id from public.user_plans where id = $1 and is_active = true limit 1`,
      [body.planId]
    );
    if (!planRes.rows[0]) throw new ApiError('Plan not found.', 404, 'PLAN_NOT_FOUND');

    // Org must exist.
    const orgRes = await db.query<{ id: string }>(
      `select id from public.organizations where id = $1 limit 1`,
      [orgId]
    );
    if (!orgRes.rows[0]) throw new ApiError('Organization not found.', 404, 'ORG_NOT_FOUND');

    const expiresAt = body.expiresAt ?? null;

    // Single transaction: revoke every current active assignment for the org's
    // members, then grant the new plan to each member. Keeps the org on exactly
    // one plan and is safe to re-run (idempotent end state).
    const client = await db.connect();
    let assigned = 0;
    try {
      await client.query('begin');

      await client.query(
        `update public.user_plan_assignments upa
            set status = 'revoked', updated_at = now()
          from public.profiles p
         where p.user_id = upa.user_id
           and p.organization_id = $1
           and upa.status = 'active'`,
        [orgId]
      );

      const ins = await client.query(
        `insert into public.user_plan_assignments
           (organization_id, user_id, plan_id, assigned_by, status, starts_at, expires_at, notes, created_at, updated_at)
         select $1, p.user_id, $2, $3, 'active', now(), $4, $5, now(), now()
           from public.profiles p
          where p.organization_id = $1
            and p.user_id is not null`,
        [orgId, body.planId, adminId, expiresAt, body.notes ?? null]
      );
      assigned = ins.rowCount ?? 0;

      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    res.status(200).json({ ok: true, assigned, plan_id: body.planId, expires_at: expiresAt });
  })
);

adminRouter.post(
  '/organizations/:orgId/revoke-plan',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);
    const { orgId } = orgIdParam.parse(req.params);

    const result = await db.query(
      `update public.user_plan_assignments upa
          set status = 'revoked', updated_at = now()
        from public.profiles p
       where p.user_id = upa.user_id
         and p.organization_id = $1
         and upa.status = 'active'`,
      [orgId]
    );

    res.status(200).json({ ok: true, revoked: result.rowCount ?? 0 });
  })
);

// ── Plans management ────────────────────────────────────────────────────────

adminRouter.get(
  '/plans',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);

    const result = await db
      .query('SELECT * FROM public.user_plans ORDER BY plan_type ASC')
      .catch(() => ({ rows: [] }));

    res.status(200).json(result.rows);
  })
);

adminRouter.put(
  '/plans/prices',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);

    // The admin dashboard saves all rows at once: { updates: [{ planId, ... }] }.
    const body = z
      .object({
        updates: z
          .array(
            z.object({
              planId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
              price_monthly: z.number().min(0).max(99_999_999).nullish(),
              price_yearly: z.number().min(0).max(99_999_999).nullish(),
              currency: z
                .string()
                .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO code')
                .optional(),
            })
          )
          .min(1)
          .max(50),
      })
      .parse(req.body);

    for (const u of body.updates) {
      await db.query(
        `UPDATE public.user_plans SET
           price_monthly = COALESCE($1, price_monthly),
           price_yearly  = COALESCE($2, price_yearly),
           currency      = COALESCE($3, currency),
           updated_at    = now()
         WHERE id = $4`,
        [u.price_monthly ?? null, u.price_yearly ?? null, u.currency ?? null, u.planId]
      );
    }

    res.status(200).json({ ok: true, updated: body.updates.length });
  })
);

adminRouter.post(
  '/plans/sync-flutterwave',
  asyncHandler(async (_req, res) => {
    // Placeholder -- Flutterwave sync to be implemented with provider integration
    res.status(202).json({ ok: true, message: 'Sync queued' });
  })
);

// ── User management (approve, disable, delete) ─────────────────────────────

adminRouter.post(
  '/users/:userId/approve',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);
    const { userId } = z
      .object({ userId: z.string().regex(/^[0-9a-fA-F-]{36}$/) })
      .parse(req.params);

    await db.query(
      `UPDATE public.profiles SET status = 'active', approved_at = now(), approved_by = $1, updated_at = now() WHERE user_id = $2`,
      [req.auth!.userId, userId]
    );
    await db.query(
      `UPDATE public.auth_users SET is_active = true, updated_at = now() WHERE id = $1`,
      [userId]
    );

    res.status(200).json({ ok: true });
  })
);

adminRouter.post(
  '/users/:userId/disable',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);
    const { userId } = z
      .object({ userId: z.string().regex(/^[0-9a-fA-F-]{36}$/) })
      .parse(req.params);
    const body = z.object({ reason: z.string().optional() }).parse(req.body);

    await db.query(
      `UPDATE public.profiles SET status = 'disabled', disabled_at = now(), disabled_by = $1, updated_at = now() WHERE user_id = $2`,
      [req.auth!.userId, userId]
    );
    await db.query(
      `UPDATE public.auth_users SET is_active = false, refresh_token = NULL, updated_at = now() WHERE id = $1`,
      [userId]
    );

    res.status(200).json({ ok: true });
  })
);

adminRouter.post(
  '/users/:userId/delete',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);
    const { userId } = z
      .object({ userId: z.string().regex(/^[0-9a-fA-F-]{36}$/) })
      .parse(req.params);

    // Soft delete: disable and mark
    await db.query(
      `UPDATE public.profiles SET status = 'deleted', disabled_at = now(), disabled_by = $1, updated_at = now() WHERE user_id = $2`,
      [req.auth!.userId, userId]
    );
    await db.query(
      `UPDATE public.auth_users SET is_active = false, refresh_token = NULL, updated_at = now() WHERE id = $1`,
      [userId]
    );

    res.status(200).json({ ok: true });
  })
);

adminRouter.post(
  '/organizations',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);
    const body = z
      .object({
        name: z.string().trim().min(1),
        email: z.string().email().optional(),
        description: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        website: z.string().optional(),
      })
      .parse(req.body);

    const result = await db.query(
      `INSERT INTO public.organizations (name, email, description, address, phone, website, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now(), now())
       RETURNING id`,
      [
        body.name,
        body.email || null,
        body.description || null,
        body.address || null,
        body.phone || null,
        body.website || null,
      ]
    );

    res.status(201).json(result.rows[0]?.id || null);
  })
);

adminRouter.get(
  '/subscriptions',
  asyncHandler(async (req, res) => {
    await requirePlatformAdminUser(req.auth!.userId);

    const result = await db.query(
      `
      select
        s.id,
        s.status,
        s.billing_interval,
        s.organization_id,
        s.user_id,
        s.current_period_end,
        s.cancel_at_period_end,
        up.name as plan_name,
        up.display_name as plan_display_name,
        up.price_monthly,
        up.price_yearly,
        up.currency,
        o.name as organization_name,
        au.email as provider_customer_email
      from public.subscriptions s
      left join public.user_plans up on up.id = s.plan_id
      left join public.organizations o on o.id = s.organization_id
      left join public.auth_users au on au.id = s.user_id
      order by s.created_at desc
      `
    );

    res.status(200).json(result.rows);
  })
);

// ── Storage health: detect and mark missing files ───────────────────────────

const storageScanBody = z.object({
  apply: z.boolean().optional().default(false),
  limit: z.coerce.number().int().positive().max(5000).optional().default(2000),
});

/**
 * Scan documents and document_versions for rows whose bytes are no longer
 * resolvable in the active storage driver, and mark them as 'missing' so
 * the UI can render a "file unavailable — please re-upload" state instead
 * of a generic 404.
 *
 * Default is dry-run; pass `apply: true` to flip rows. Only checks rows
 * currently marked 'present' so reruns are cheap.
 *
 * Background: before STORAGE_DRIVER=s3 landed, the backend wrote files to
 * /app/storage on a container with no volume mounted. Bytes vanished on
 * every redeploy while the DB rows survived. After the Garage cutover,
 * those rows still 404; this endpoint surfaces which ones.
 */
adminRouter.post(
  '/storage/scan',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    await requirePlatformAdminUser(auth.userId);

    const { apply, limit } = storageScanBody.parse(req.body ?? {});

    const docs = await db.query<{ id: string; file_path: string }>(
      `select id, file_path
         from public.documents
        where storage_status = 'present'
          and file_path is not null
          and file_path <> ''
        order by created_at asc
        limit $1`,
      [limit]
    );

    const versions = await db.query<{ id: string; storage_path: string }>(
      `select id, storage_path
         from public.document_versions
        where storage_status = 'present'
          and storage_path is not null
          and storage_path <> ''
        order by created_at asc
        limit $1`,
      [limit]
    );

    const missingDocIds: string[] = [];
    const missingVersionIds: string[] = [];

    // Limited concurrency: HEAD is cheap but Garage isn't infinitely
    // fast and we don't want to thrash on a runaway dataset.
    const CONCURRENCY = 12;
    async function checkBatch<T extends { id: string; path: string }>(
      items: T[],
      onMissing: (id: string) => void
    ) {
      let i = 0;
      const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
        while (i < items.length) {
          const it = items[i++];
          try {
            const ok = await fileExists('documents', it.path);
            if (!ok) onMissing(it.id);
          } catch (err) {
            // Treat path-validation failures (traversal etc.) as missing
            // for purposes of the audit — they aren't downloadable anyway.
            if (err instanceof Error && /Invalid file path/.test(err.message)) {
              onMissing(it.id);
            } else {
              throw err;
            }
          }
        }
      });
      await Promise.all(workers);
    }

    await checkBatch(
      docs.rows.map((r) => ({ id: r.id, path: r.file_path })),
      (id) => missingDocIds.push(id)
    );
    await checkBatch(
      versions.rows.map((r) => ({ id: r.id, path: r.storage_path })),
      (id) => missingVersionIds.push(id)
    );

    if (apply && (missingDocIds.length || missingVersionIds.length)) {
      if (missingDocIds.length) {
        await db.query(
          `update public.documents set storage_status = 'missing', updated_at = now()
            where id = any($1::uuid[])`,
          [missingDocIds]
        );
      }
      if (missingVersionIds.length) {
        await db.query(
          `update public.document_versions set storage_status = 'missing'
            where id = any($1::uuid[])`,
          [missingVersionIds]
        );
      }
    }

    res.status(200).json({
      mode: apply ? 'applied' : 'dry_run',
      scanned: { documents: docs.rows.length, versions: versions.rows.length },
      missing: {
        documents: missingDocIds.length,
        versions: missingVersionIds.length,
        document_ids: missingDocIds.slice(0, 50),
        version_ids: missingVersionIds.slice(0, 50),
      },
    });
  })
);

// ── Storage sweep: hard-delete tombstoned rows past their grace window ──────

const storageSweepBody = z.object({
  apply: z.boolean().optional().default(false),
  // Rows whose deleted_at is older than now() - graceDays are eligible.
  // Default 30 days. Min 1 day so we don't accidentally wipe a tombstone
  // the same hour a user created it.
  graceDays: z.coerce.number().int().min(1).max(3650).optional().default(30),
  limit: z.coerce.number().int().positive().max(5000).optional().default(2000),
});

/**
 * Hard-delete documents (and their cascaded versions, edits, tabular
 * cells) whose tombstone is older than the grace window, and unlink the
 * underlying Garage objects so they stop counting toward the bucket
 * quota.
 *
 * Default is dry-run; pass `{apply: true}` to actually delete. Run on a
 * cron from outside (Railway scheduled job, GitHub Actions, or hand-fire
 * from a Slack /command) — the endpoint is intentionally idempotent.
 *
 * Storage object delete failures do NOT block the DB delete: the row
 * still goes away, and the orphaned object will be picked up by a
 * future `garage bucket cleanup-incomplete-uploads` or audit.
 */
adminRouter.post(
  '/storage/sweep',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    await requirePlatformAdminUser(auth.userId);

    const { apply, graceDays, limit } = storageSweepBody.parse(req.body ?? {});

    const eligible = await db.query<{ id: string; file_path: string | null }>(
      `select id, file_path
         from public.documents
        where deleted_at is not null
          and deleted_at < now() - make_interval(days => $1::int)
        order by deleted_at asc
        limit $2`,
      [graceDays, limit]
    );

    let storageDeleted = 0;
    const storageErrors: Array<{ id: string; error: string }> = [];

    if (apply) {
      // 1) Remove the Garage objects first so we never leak bytes for
      //    a row we're about to drop. Errors are logged but not fatal.
      for (const row of eligible.rows) {
        if (!row.file_path) continue;
        try {
          await deleteFile('documents', row.file_path);
          storageDeleted++;
        } catch (err) {
          storageErrors.push({
            id: row.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // 2) Hard-delete the rows. document_versions / document_edits /
      //    tabular_cells fall away via CASCADE FKs.
      if (eligible.rows.length) {
        await db.query(`delete from public.documents where id = any($1::uuid[])`, [
          eligible.rows.map((r) => r.id),
        ]);
      }
    }

    res.status(200).json({
      mode: apply ? 'applied' : 'dry_run',
      graceDays,
      eligible: eligible.rows.length,
      storage_deleted: storageDeleted,
      storage_errors: storageErrors.slice(0, 20),
      sample_ids: eligible.rows.slice(0, 20).map((r) => r.id),
    });
  })
);

// ── Restore (undo a soft-delete inside the grace window) ────────────────────

adminRouter.post(
  '/storage/restore/:id',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    await requirePlatformAdminUser(auth.userId);

    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

    const result = await db.query<{ id: string }>(
      `update public.documents
          set deleted_at = null,
              updated_at = now()
        where id = $1 and deleted_at is not null
        returning id`,
      [id]
    );

    if (result.rowCount === 0) {
      throw new ApiError('No tombstoned document with that id', 404, 'NOT_FOUND');
    }

    res.status(200).json({ restored: result.rows[0].id });
  })
);
