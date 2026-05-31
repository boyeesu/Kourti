import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { asyncHandler } from '../../lib/http.js';
import { recordAdminAction } from '../../services/adminAudit.js';
import { requireAdminCapabilityFor } from '../../services/authorization.js';

/**
 * Platform-admin BULK user/org operations + CSV export.
 *
 * Mounted (relative) under /api/v1/admin. Routes:
 *   POST /bulk/users/approve   (users.manage)
 *   POST /bulk/users/disable   (users.manage)
 *   POST /bulk/users/delete    (superadmin — destructive)
 *   GET  /export/users.csv     (platform.read)
 *   GET  /export/organizations.csv (platform.read)
 *
 * Every bulk mutation requires a `reason` and writes exactly ONE
 * recordAdminAction summarizing the whole batch.
 */
export const adminBulkRouter = Router();

const UUID = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    'Invalid UUID'
  );

const bulkUsersBody = z.object({
  userIds: z
    .array(UUID)
    .min(1, 'At least one user is required')
    .max(500, 'Maximum 500 users per batch'),
  reason: z.string().trim().min(3, 'A reason of at least 3 characters is required'),
});

// ── Bulk approve ────────────────────────────────────────────────────────────

adminBulkRouter.post(
  '/bulk/users/approve',
  asyncHandler(async (req, res) => {
    const adminId = req.auth!.userId;
    await requireAdminCapabilityFor(adminId, 'users.manage');

    const { userIds, reason } = bulkUsersBody.parse(req.body);

    // Deduplicate so the count reflects distinct users.
    const ids = Array.from(new Set(userIds));

    const profileRes = await db.query(
      `update public.profiles
          set status = 'active',
              approved_at = now(),
              approved_by = $1,
              updated_at = now()
        where user_id = any($2::uuid[])`,
      [adminId, ids]
    );

    await db.query(
      `update public.auth_users
          set is_active = true,
              updated_at = now()
        where id = any($1::uuid[])`,
      [ids]
    );

    const updated = profileRes.rowCount ?? 0;

    await recordAdminAction({
      adminUserId: adminId,
      actionType: 'users.bulk_approve',
      targetType: 'users',
      reason,
      details: { userIds: ids, count: updated },
      req,
    });

    res.status(200).json({ updated });
  })
);

// ── Bulk disable ────────────────────────────────────────────────────────────

adminBulkRouter.post(
  '/bulk/users/disable',
  asyncHandler(async (req, res) => {
    const adminId = req.auth!.userId;
    await requireAdminCapabilityFor(adminId, 'users.manage');

    const { userIds, reason } = bulkUsersBody.parse(req.body);
    const ids = Array.from(new Set(userIds));

    const profileRes = await db.query(
      `update public.profiles
          set status = 'disabled',
              disabled_at = now(),
              disabled_by = $1,
              updated_at = now()
        where user_id = any($2::uuid[])`,
      [adminId, ids]
    );

    await db.query(
      `update public.auth_users
          set is_active = false,
              refresh_token = NULL,
              updated_at = now()
        where id = any($1::uuid[])`,
      [ids]
    );

    const updated = profileRes.rowCount ?? 0;

    await recordAdminAction({
      adminUserId: adminId,
      actionType: 'users.bulk_disable',
      targetType: 'users',
      reason,
      details: { userIds: ids, count: updated },
      req,
    });

    res.status(200).json({ updated });
  })
);

// ── Bulk delete (soft) — superadmin only ────────────────────────────────────

adminBulkRouter.post(
  '/bulk/users/delete',
  asyncHandler(async (req, res) => {
    const adminId = req.auth!.userId;
    // Destructive: gated on the all-powerful superadmin capability, NOT users.manage.
    await requireAdminCapabilityFor(adminId, 'superadmin');

    const { userIds, reason } = bulkUsersBody.parse(req.body);
    const ids = Array.from(new Set(userIds));

    const profileRes = await db.query(
      `update public.profiles
          set status = 'deleted',
              disabled_at = now(),
              disabled_by = $1,
              updated_at = now()
        where user_id = any($2::uuid[])`,
      [adminId, ids]
    );

    await db.query(
      `update public.auth_users
          set is_active = false,
              refresh_token = NULL,
              updated_at = now()
        where id = any($1::uuid[])`,
      [ids]
    );

    const updated = profileRes.rowCount ?? 0;

    await recordAdminAction({
      adminUserId: adminId,
      actionType: 'users.bulk_delete',
      targetType: 'users',
      reason,
      details: { userIds: ids, count: updated },
      req,
    });

    res.status(200).json({ updated });
  })
);

// ── CSV helpers ─────────────────────────────────────────────────────────────

/**
 * RFC-4180-ish escaping: quote-wrap every field and double any internal
 * quotes. Wrapping unconditionally is safe and sidesteps comma/newline edge
 * cases entirely. null/undefined render as empty.
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let s: string;
  if (value instanceof Date) s = value.toISOString();
  else s = String(value);
  // Neutralize CSV formula injection (CWE-1236): user-controlled fields
  // (email/first_name/last_name) beginning with a formula trigger can execute
  // when the export is opened in a spreadsheet. Prefix such cells with an apostrophe.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(',');
}

const EXPORT_CAP = 50_000;

// ── Export users.csv ────────────────────────────────────────────────────────

const usersExportQuery = z.object({
  status: z.string().trim().min(1).optional(),
  organization_id: UUID.optional(),
  q: z.string().trim().min(1).optional(),
});

adminBulkRouter.get(
  '/export/users.csv',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');

    const filters = usersExportQuery.parse(req.query);

    const where: string[] = [];
    const values: unknown[] = [];

    if (filters.status) {
      values.push(filters.status);
      where.push(`p.status = $${values.length}`);
    }
    if (filters.organization_id) {
      values.push(filters.organization_id);
      where.push(`p.organization_id = $${values.length}`);
    }
    if (filters.q) {
      values.push(`%${filters.q}%`);
      const i = values.length;
      where.push(`(au.email ilike $${i} or p.first_name ilike $${i} or p.last_name ilike $${i})`);
    }

    const whereSql = where.length ? `where ${where.join(' and ')}` : '';
    values.push(EXPORT_CAP);

    const result = await db.query(
      `
      select
        p.user_id,
        au.email,
        p.first_name,
        p.last_name,
        p.status,
        p.organization_id,
        p.created_at,
        au.last_sign_in_at,
        au.login_count
      from public.profiles p
      left join public.auth_users au on au.id = p.user_id
      ${whereSql}
      order by p.created_at desc
      limit $${values.length}
      `,
      values
    );

    const header = [
      'user_id',
      'email',
      'first_name',
      'last_name',
      'status',
      'organization_id',
      'created_at',
      'last_sign_in_at',
      'login_count',
    ];

    const lines = [csvRow(header)];
    for (const r of result.rows) {
      lines.push(
        csvRow([
          r.user_id,
          r.email,
          r.first_name,
          r.last_name,
          r.status,
          r.organization_id,
          r.created_at,
          r.last_sign_in_at,
          r.login_count,
        ])
      );
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
    res.status(200).send(lines.join('\r\n'));
  })
);

// ── Export organizations.csv ────────────────────────────────────────────────

adminBulkRouter.get(
  '/export/organizations.csv',
  asyncHandler(async (req, res) => {
    await requireAdminCapabilityFor(req.auth!.userId, 'platform.read');

    const result = await db.query(
      `
      select
        o.id,
        o.name,
        o.email,
        o.created_at,
        (select count(*)::int from public.profiles p where p.organization_id = o.id) as member_count
      from public.organizations o
      order by o.created_at desc
      limit $1
      `,
      [EXPORT_CAP]
    );

    const header = ['id', 'name', 'email', 'created_at', 'member_count'];

    const lines = [csvRow(header)];
    for (const r of result.rows) {
      lines.push(csvRow([r.id, r.name, r.email, r.created_at, r.member_count]));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="organizations.csv"');
    res.status(200).send(lines.join('\r\n'));
  })
);
