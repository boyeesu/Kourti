import { Router } from 'express';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { getBoss } from '../../lib/pgboss.js';
import { checkRateLimit } from '../../lib/rateLimit.js';

export const intelligenceRouter = Router();

// ── GET /latest — Get latest snapshot ────────────────────────────────

intelligenceRouter.get(
  '/latest',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;

    const result = await db.query(
      `select * from intelligence_snapshots
       where organization_id = $1
       order by created_at desc
       limit 1`,
      [organizationId]
    );

    res.json({ success: true, data: result.rows[0] ?? null });
  })
);

// ── POST /generate — Trigger ad-hoc synthesis ────────────────────────

intelligenceRouter.post(
  '/generate',
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const rl = checkRateLimit(`intel-gen:${organizationId}`, 3, 60_000);
    if (!rl.allowed) {
      throw new ApiError(
        `Rate limit exceeded. Retry after ${rl.retryAfter}s`,
        429,
        'RATE_LIMIT_EXCEEDED'
      );
    }

    // Create agent job
    const job = await db.query(
      `insert into agent_jobs (organization_id, created_by, agent_type, input)
       values ($1, $2, 'intelligence_synthesis', $3)
       returning id`,
      [organizationId, userId, JSON.stringify({ snapshotType: 'ad_hoc' })]
    );

    const boss = getBoss();
    await boss.send('intelligence_synthesis', {
      _jobId: job.rows[0].id,
      snapshotType: 'ad_hoc',
    });

    res.status(201).json({
      success: true,
      data: { jobId: job.rows[0].id, message: 'Intelligence synthesis started' },
    });
  })
);

// ── GET /recommendations — List active recommendations ───────────────

intelligenceRouter.get(
  '/recommendations',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const validStatuses = ['active', 'acted_on', 'dismissed'];
    const rawStatus = String(req.query.status ?? 'active');
    const status = validStatuses.includes(rawStatus) ? rawStatus : 'active';

    const result = await db.query(
      `select r.*, s.created_at as snapshot_date
       from intelligence_recommendations r
       join intelligence_snapshots s on s.id = r.snapshot_id
       where r.organization_id = $1 and r.status = $2
       order by
         case r.priority when 'high' then 0 when 'medium' then 1 else 2 end,
         r.created_at desc
       limit 50`,
      [organizationId, status]
    );

    res.json({ success: true, data: result.rows });
  })
);

// ── PATCH /recommendations/:id — Dismiss/act on recommendation ───────

intelligenceRouter.patch(
  '/recommendations/:id',
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const status = (req.body as { status?: string }).status;

    if (!status || !['acted_on', 'dismissed'].includes(status as string)) {
      throw new ApiError(
        'Invalid status. Must be "acted_on" or "dismissed"',
        400,
        'INVALID_STATUS'
      );
    }

    const result = await db.query(
      `update intelligence_recommendations
       set status = $3, dismissed_by = case when $3 = 'dismissed' then $4 else null end
       where id = $1 and organization_id = $2
       returning *`,
      [req.params.id, organizationId, status, userId]
    );

    if (!result.rows[0]) throw new ApiError('Recommendation not found', 404, 'NOT_FOUND');
    res.json({ success: true, data: result.rows[0] });
  })
);

// ── GET /history — Past snapshots ────────────────────────────────────

intelligenceRouter.get(
  '/history',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;

    const result = await db.query(
      `select id, snapshot_type, created_at, generated_by_job_id
       from intelligence_snapshots
       where organization_id = $1
       order by created_at desc
       limit 30`,
      [organizationId]
    );

    res.json({ success: true, data: result.rows });
  })
);
