import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { getBoss } from '../../lib/pgboss.js';
import { markApprovalExecuted } from '../../lib/approvalGate.js';
import { checkRateLimit } from '../../lib/rateLimit.js';
import { isOrgAdminOrSoleMember } from '../../services/authorization.js';

// ── Helpers ──────────────────────────────────────────────────────────

function enforceRateLimit(identifier: string, maxRequests: number, windowMs: number) {
  const result = checkRateLimit(identifier, maxRequests, windowMs);
  if (!result.allowed) {
    throw new ApiError(
      `Rate limit exceeded. Retry after ${result.retryAfter}s`,
      429,
      'RATE_LIMIT_EXCEEDED'
    );
  }
}

// H8 — use the canonical org-admin authorization check (user_role_assignments
// + sole-member fallback) instead of the divergent free-text profiles.role
// lookup. Same allow/deny outcome for genuine org admins, consistent with
// billing.ts / misc.ts.
async function requireAdminRole(userId: string, organizationId: string) {
  const allowed = await isOrgAdminOrSoleMember(userId, organizationId);
  if (!allowed) {
    throw new ApiError('This action requires admin privileges', 403, 'ADMIN_REQUIRED');
  }
}

export const agentsRouter = Router();

// ── Schemas ──────────────────────────────────────────────────────────

const createJobSchema = z.object({
  agentType: z.enum(['matter_review', 'intelligence_synthesis']),
  input: z.record(z.string(), z.unknown()),
  priority: z.number().int().min(0).max(10).optional(),
});

const listJobsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']).optional(),
  agentType: z.string().optional(),
});

const updateConfigSchema = z.object({
  matterReviewEnabled: z.boolean().optional(),
  maxConcurrentJobs: z.number().int().min(1).max(20).optional(),
  dailyTokenBudget: z.number().int().min(0).optional(),
  llmModelOverride: z.string().nullable().optional(),
});

// ── POST /jobs — Create an agent job ─────────────────────────────────

agentsRouter.post(
  '/jobs',
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    enforceRateLimit(`agent-jobs:${organizationId}`, 10, 60_000); // 10 jobs/min per org
    const body = createJobSchema.parse(req.body);

    // Check agent config
    const configRow = await db.query(`select * from agent_configs where organization_id = $1`, [
      organizationId,
    ]);
    const config = configRow.rows[0];

    if (body.agentType === 'matter_review' && config && !config.matter_review_enabled) {
      throw new ApiError(
        'Matter review agent is disabled for this organization',
        403,
        'AGENT_DISABLED'
      );
    }

    // Check concurrent job limit
    const maxConcurrent = config?.max_concurrent_jobs ?? 3;
    const runningCount = await db.query(
      `select count(*)::int as count from agent_jobs
       where organization_id = $1 and status in ('pending', 'running')`,
      [organizationId]
    );

    if (runningCount.rows[0].count >= maxConcurrent) {
      throw new ApiError(
        `Maximum concurrent jobs (${maxConcurrent}) reached. Wait for existing jobs to finish.`,
        429,
        'AGENT_CONCURRENCY_LIMIT'
      );
    }

    // Validate agent-specific input
    if (body.agentType === 'matter_review') {
      if (!body.input.caseId || typeof body.input.caseId !== 'string') {
        throw new ApiError('Matter review requires a valid caseId in input', 400, 'INVALID_INPUT');
      }
      // Verify case exists and belongs to org
      const caseCheck = await db.query(
        `select id from cases where id = $1 and organization_id = $2`,
        [body.input.caseId, organizationId]
      );
      if (!caseCheck.rows[0]) {
        throw new ApiError('Case not found', 404, 'CASE_NOT_FOUND');
      }
    }

    // Create job record
    const jobResult = await db.query(
      `insert into agent_jobs (organization_id, created_by, agent_type, input, priority)
       values ($1, $2, $3, $4, $5)
       returning id, status, progress, created_at`,
      [organizationId, userId, body.agentType, JSON.stringify(body.input), body.priority ?? 0]
    );

    const job = jobResult.rows[0];

    // Enqueue via pg-boss — pass _jobId so the worker can look up the full job
    const boss = getBoss();
    await boss.send(body.agentType, {
      _jobId: job.id,
      ...body.input,
    });

    res.status(201).json({
      success: true,
      data: {
        id: job.id,
        agentType: body.agentType,
        status: job.status,
        progress: job.progress,
        createdAt: job.created_at,
      },
    });
  })
);

// ── GET /jobs — List jobs ────────────────────────────────────────────

agentsRouter.get(
  '/jobs',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const query = listJobsQuerySchema.parse(req.query);

    const conditions = ['organization_id = $1'];
    const params: unknown[] = [organizationId];
    let paramIdx = 2;

    if (query.status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(query.status);
    }
    if (query.agentType) {
      conditions.push(`agent_type = $${paramIdx++}`);
      params.push(query.agentType);
    }

    const where = conditions.join(' and ');
    const offset = (query.page - 1) * query.pageSize;

    const [jobsResult, countResult] = await Promise.all([
      db.query(
        `select id, agent_type, status, priority, progress, progress_message,
                error, started_at, completed_at, created_at, updated_at,
                created_by, input
         from agent_jobs
         where ${where}
         order by created_at desc
         limit $${paramIdx++} offset $${paramIdx}`,
        [...params, query.pageSize, offset]
      ),
      db.query(`select count(*)::int as total from agent_jobs where ${where}`, params),
    ]);

    res.json({
      success: true,
      data: jobsResult.rows,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: countResult.rows[0].total,
        totalPages: Math.ceil(countResult.rows[0].total / query.pageSize),
      },
    });
  })
);

// ── GET /jobs/:jobId — Get job with steps ────────────────────────────

agentsRouter.get(
  '/jobs/:jobId',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { jobId } = req.params;

    const jobResult = await db.query(
      `select * from agent_jobs where id = $1 and organization_id = $2`,
      [jobId, organizationId]
    );

    if (!jobResult.rows[0]) {
      throw new ApiError('Agent job not found', 404, 'JOB_NOT_FOUND');
    }

    const stepsResult = await db.query(
      `select id, step_name, step_index, status, output, error,
              tokens_used, model_used, duration_ms, started_at, completed_at
       from agent_job_steps
       where job_id = $1
       order by step_index asc`,
      [jobId]
    );

    res.json({
      success: true,
      data: {
        ...jobResult.rows[0],
        steps: stepsResult.rows,
      },
    });
  })
);

// ── POST /jobs/:jobId/cancel — Cancel a job ──────────────────────────

agentsRouter.post(
  '/jobs/:jobId/cancel',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { jobId } = req.params;

    const result = await db.query(
      `update agent_jobs
       set status = 'cancelled', updated_at = now()
       where id = $1 and organization_id = $2 and status in ('pending', 'running')
       returning id, status`,
      [jobId, organizationId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Job not found or already finished', 404, 'JOB_NOT_CANCELLABLE');
    }

    res.json({ success: true, data: result.rows[0] });
  })
);

// ── GET /jobs/:jobId/audit — Job audit trail ─────────────────────────

agentsRouter.get(
  '/jobs/:jobId/audit',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { jobId } = req.params;

    // Verify job belongs to org
    const jobCheck = await db.query(
      `select id from agent_jobs where id = $1 and organization_id = $2`,
      [jobId, organizationId]
    );
    if (!jobCheck.rows[0]) {
      throw new ApiError('Agent job not found', 404, 'JOB_NOT_FOUND');
    }

    const result = await db.query(
      `select id, action, entity_type, entity_id, details, created_at
       from agent_audit_logs
       where job_id = $1
       order by created_at asc`,
      [jobId]
    );

    res.json({ success: true, data: result.rows });
  })
);

// ── GET /config — Get org agent config ───────────────────────────────

agentsRouter.get(
  '/config',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;

    const result = await db.query(`select * from agent_configs where organization_id = $1`, [
      organizationId,
    ]);

    // Return defaults if no config row exists
    const config = result.rows[0] ?? {
      organization_id: organizationId,
      matter_review_enabled: true,
      max_concurrent_jobs: 3,
      daily_token_budget: 500000,
      llm_model_override: null,
    };

    res.json({ success: true, data: config });
  })
);

// ── PUT /config — Update org agent config ────────────────────────────

agentsRouter.put(
  '/config',
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    await requireAdminRole(userId, organizationId);
    const body = updateConfigSchema.parse(req.body);

    const result = await db.query(
      `insert into agent_configs (organization_id, matter_review_enabled, max_concurrent_jobs, daily_token_budget, llm_model_override)
       values ($1, $2, $3, $4, $5)
       on conflict (organization_id) do update set
         matter_review_enabled = coalesce($2, agent_configs.matter_review_enabled),
         max_concurrent_jobs = coalesce($3, agent_configs.max_concurrent_jobs),
         daily_token_budget = coalesce($4, agent_configs.daily_token_budget),
         llm_model_override = $5,
         updated_at = now()
       returning *`,
      [
        organizationId,
        body.matterReviewEnabled ?? true,
        body.maxConcurrentJobs ?? 3,
        body.dailyTokenBudget ?? 500000,
        body.llmModelOverride ?? null,
      ]
    );

    res.json({ success: true, data: result.rows[0] });
  })
);

// ═══════════════════════════════════════════════════════════════════════
// MONITORING AGENTS
// ═══════════════════════════════════════════════════════════════════════

const VALID_MONITOR_TYPES = ['contract_expiration', 'case_deadline', 'document_change'] as const;

const updateMonitorSchema = z.object({
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  runIntervalMinutes: z.number().int().min(5).max(10080).optional(),
});

const listAlertsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'acknowledged', 'resolved', 'dismissed']).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  entityType: z.string().optional(),
});

const updateAlertSchema = z.object({
  status: z.enum(['acknowledged', 'resolved', 'dismissed']),
});

// ── GET /monitors — List monitors for org ────────────────────────────

agentsRouter.get(
  '/monitors',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;

    const result = await db.query(
      `select * from agent_monitors where organization_id = $1 order by monitor_type`,
      [organizationId]
    );

    if (result.rows.length === 0) {
      const defaults = VALID_MONITOR_TYPES.map((type) => ({
        organization_id: organizationId,
        monitor_type: type,
        enabled: false,
        config: {},
        last_run_at: null,
        next_run_at: null,
        run_interval_minutes: 1440,
      }));
      res.json({ success: true, data: defaults });
      return;
    }

    res.json({ success: true, data: result.rows });
  })
);

// ── PUT /monitors/:type — Enable/configure a monitor ─────────────────

agentsRouter.put(
  '/monitors/:type',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const monitorType = req.params.type;

    if (!VALID_MONITOR_TYPES.includes(monitorType as (typeof VALID_MONITOR_TYPES)[number])) {
      throw new ApiError(`Invalid monitor type: ${monitorType}`, 400, 'INVALID_MONITOR_TYPE');
    }

    const body = updateMonitorSchema.parse(req.body);

    const result = await db.query(
      `insert into agent_monitors (organization_id, monitor_type, enabled, config, run_interval_minutes, next_run_at)
       values ($1, $2, $3, $4, $5, case when $3 then now() else null end)
       on conflict (organization_id, monitor_type) do update set
         enabled = coalesce($3, agent_monitors.enabled),
         config = coalesce($4, agent_monitors.config),
         run_interval_minutes = coalesce($5, agent_monitors.run_interval_minutes),
         next_run_at = case when coalesce($3, agent_monitors.enabled) then coalesce(agent_monitors.next_run_at, now()) else null end,
         updated_at = now()
       returning *`,
      [
        organizationId,
        monitorType,
        body.enabled ?? true,
        body.config ? JSON.stringify(body.config) : '{}',
        body.runIntervalMinutes ?? 1440,
      ]
    );

    res.json({ success: true, data: result.rows[0] });
  })
);

// ── POST /monitors/:type/run — Trigger a monitor run immediately ─────

agentsRouter.post(
  '/monitors/:type/run',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    enforceRateLimit(`monitor-run:${organizationId}`, 5, 60_000); // 5 runs/min per org
    const monitorType = req.params.type;

    const monitor = await db.query(
      `select * from agent_monitors where organization_id = $1 and monitor_type = $2`,
      [organizationId, monitorType]
    );

    if (!monitor.rows[0]) {
      throw new ApiError('Monitor not found. Enable it first.', 404, 'MONITOR_NOT_FOUND');
    }

    const boss = getBoss();
    await boss.send('monitor_run', {
      monitorId: monitor.rows[0].id,
      organizationId,
      monitorType,
      config: monitor.rows[0].config,
      lastRunAt: monitor.rows[0].last_run_at,
    });

    res.json({ success: true, data: { message: 'Monitor run scheduled' } });
  })
);

// ── GET /alerts — List alerts ────────────────────────────────────────

agentsRouter.get(
  '/alerts',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const query = listAlertsQuerySchema.parse(req.query);

    const conditions = ['organization_id = $1'];
    const params: unknown[] = [organizationId];
    let paramIdx = 2;

    if (query.status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(query.status);
    }
    if (query.severity) {
      conditions.push(`severity = $${paramIdx++}`);
      params.push(query.severity);
    }
    if (query.entityType) {
      conditions.push(`entity_type = $${paramIdx++}`);
      params.push(query.entityType);
    }

    const where = conditions.join(' and ');
    const offset = (query.page - 1) * query.pageSize;

    const [alertsResult, countResult] = await Promise.all([
      db.query(
        `select * from agent_alerts
         where ${where}
         order by
           case severity when 'critical' then 0 when 'warning' then 1 else 2 end,
           created_at desc
         limit $${paramIdx++} offset $${paramIdx}`,
        [...params, query.pageSize, offset]
      ),
      db.query(`select count(*)::int as total from agent_alerts where ${where}`, params),
    ]);

    const summary = await db.query(
      `select
         count(*) filter (where status = 'active')::int as active,
         count(*) filter (where status = 'active' and severity = 'critical')::int as critical,
         count(*) filter (where status = 'active' and severity = 'warning')::int as warning,
         count(*) filter (where status = 'active' and severity = 'info')::int as info
       from agent_alerts where organization_id = $1`,
      [organizationId]
    );

    res.json({
      success: true,
      data: alertsResult.rows,
      summary: summary.rows[0],
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: countResult.rows[0].total,
        totalPages: Math.ceil(countResult.rows[0].total / query.pageSize),
      },
    });
  })
);

// ── GET /alerts/summary — Quick alert counts ─────────────────────────

agentsRouter.get(
  '/alerts/summary',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;

    const result = await db.query(
      `select
         count(*) filter (where status = 'active')::int as active,
         count(*) filter (where status = 'active' and severity = 'critical')::int as critical,
         count(*) filter (where status = 'active' and severity = 'warning')::int as warning,
         count(*) filter (where status = 'active' and severity = 'info')::int as info
       from agent_alerts where organization_id = $1`,
      [organizationId]
    );

    res.json({ success: true, data: result.rows[0] });
  })
);

// ── PATCH /alerts/:alertId — Update alert status ─────────────────────

agentsRouter.patch(
  '/alerts/:alertId',
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const { alertId } = req.params;
    const body = updateAlertSchema.parse(req.body);

    const setClauses = ['status = $3'];
    const params: unknown[] = [alertId, organizationId, body.status];

    if (body.status === 'acknowledged') {
      setClauses.push(`acknowledged_by = $${params.length + 1}`);
      params.push(userId);
      setClauses.push(`acknowledged_at = now()`);
    }
    if (body.status === 'resolved') {
      setClauses.push(`resolved_at = now()`);
    }

    const result = await db.query(
      `update agent_alerts set ${setClauses.join(', ')}
       where id = $1 and organization_id = $2
       returning *`,
      params
    );

    if (!result.rows[0]) {
      throw new ApiError('Alert not found', 404, 'ALERT_NOT_FOUND');
    }

    res.json({ success: true, data: result.rows[0] });
  })
);

// ═══════════════════════════════════════════════════════════════════════
// APPROVAL WORKFLOWS
// ═══════════════════════════════════════════════════════════════════════

const listApprovalsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'approved', 'rejected', 'expired']).optional(),
});

const reviewApprovalSchema = z.object({
  notes: z.string().max(2000).optional(),
});

// ── GET /approvals — List approval requests ──────────────────────────

agentsRouter.get(
  '/approvals',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const query = listApprovalsQuerySchema.parse(req.query);

    const conditions = ['organization_id = $1'];
    const params: unknown[] = [organizationId];
    let paramIdx = 2;

    if (query.status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(query.status);
    }

    const where = conditions.join(' and ');
    const offset = (query.page - 1) * query.pageSize;

    const [rows, count] = await Promise.all([
      db.query(
        `select * from agent_approval_requests
         where ${where}
         order by created_at desc
         limit $${paramIdx++} offset $${paramIdx}`,
        [...params, query.pageSize, offset]
      ),
      db.query(`select count(*)::int as total from agent_approval_requests where ${where}`, params),
    ]);

    const pendingCount = await db.query(
      `select count(*)::int as count from agent_approval_requests
       where organization_id = $1 and status = 'pending'`,
      [organizationId]
    );

    res.json({
      success: true,
      data: rows.rows,
      pendingCount: pendingCount.rows[0].count,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: count.rows[0].total,
        totalPages: Math.ceil(count.rows[0].total / query.pageSize),
      },
    });
  })
);

// ── POST /approvals/:id/approve — Approve and execute ────────────────

agentsRouter.post(
  '/approvals/:approvalId/approve',
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    await requireAdminRole(userId, organizationId);
    const { approvalId } = req.params;
    const body = reviewApprovalSchema.parse(req.body);

    const result = await db.query(
      `update agent_approval_requests
       set status = 'approved', reviewed_by = $3, reviewed_at = now(), review_notes = $4
       where id = $1 and organization_id = $2 and status = 'pending'
       returning *`,
      [approvalId, organizationId, userId, body.notes ?? null]
    );

    if (!result.rows[0]) {
      throw new ApiError('Approval not found or already reviewed', 404, 'APPROVAL_NOT_FOUND');
    }

    // Mark as executed (actual execution would be dispatched by the calling agent)
    await markApprovalExecuted(approvalId, organizationId, { approvedBy: userId, manual: true });

    await db.query(
      `insert into agent_audit_logs (organization_id, user_id, action, details)
       values ($1, $2, 'approval_approved', $3)`,
      [
        organizationId,
        userId,
        JSON.stringify({
          approvalId,
          actionType: result.rows[0].action_type,
          confidence: result.rows[0].confidence,
        }),
      ]
    );

    res.json({ success: true, data: result.rows[0] });
  })
);

// ── POST /approvals/:id/reject — Reject ──────────────────────────────

agentsRouter.post(
  '/approvals/:approvalId/reject',
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    await requireAdminRole(userId, organizationId);
    const { approvalId } = req.params;
    const body = reviewApprovalSchema.parse(req.body);

    const result = await db.query(
      `update agent_approval_requests
       set status = 'rejected', reviewed_by = $3, reviewed_at = now(), review_notes = $4
       where id = $1 and organization_id = $2 and status = 'pending'
       returning *`,
      [approvalId, organizationId, userId, body.notes ?? null]
    );

    if (!result.rows[0]) {
      throw new ApiError('Approval not found or already reviewed', 404, 'APPROVAL_NOT_FOUND');
    }

    await db.query(
      `insert into agent_audit_logs (organization_id, user_id, action, details)
       values ($1, $2, 'approval_rejected', $3)`,
      [
        organizationId,
        userId,
        JSON.stringify({
          approvalId,
          actionType: result.rows[0].action_type,
          notes: body.notes,
        }),
      ]
    );

    res.json({ success: true, data: result.rows[0] });
  })
);

// ── GET /audit — Org-wide audit log ──────────────────────────────────

agentsRouter.get(
  '/audit',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize)) || 50));
    const offset = (page - 1) * pageSize;

    const [rows, count] = await Promise.all([
      db.query(
        `select * from agent_audit_logs
         where organization_id = $1
         order by created_at desc
         limit $2 offset $3`,
        [organizationId, pageSize, offset]
      ),
      db.query(`select count(*)::int as total from agent_audit_logs where organization_id = $1`, [
        organizationId,
      ]),
    ]);

    res.json({
      success: true,
      data: rows.rows,
      pagination: {
        page,
        pageSize,
        total: count.rows[0].total,
        totalPages: Math.ceil(count.rows[0].total / pageSize),
      },
    });
  })
);

// ── GET /dashboard — Agent activity summary ──────────────────────────

agentsRouter.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;

    const [jobs, alerts, approvals, tokens] = await Promise.all([
      db.query(
        `select
           count(*) filter (where created_at > now() - interval '24 hours')::int as today,
           count(*) filter (where status = 'running')::int as running,
           count(*) filter (where status = 'completed')::int as completed,
           count(*) filter (where status = 'failed')::int as failed
         from agent_jobs where organization_id = $1`,
        [organizationId]
      ),
      db.query(
        `select
           count(*) filter (where status = 'active')::int as active,
           count(*) filter (where status = 'active' and severity = 'critical')::int as critical
         from agent_alerts where organization_id = $1`,
        [organizationId]
      ),
      db.query(
        `select count(*)::int as pending
         from agent_approval_requests
         where organization_id = $1 and status = 'pending'`,
        [organizationId]
      ),
      db.query(
        `select coalesce(sum(s.tokens_used), 0)::int as total_tokens
         from agent_job_steps s
         join agent_jobs j on j.id = s.job_id
         where j.organization_id = $1
           and j.created_at > now() - interval '24 hours'`,
        [organizationId]
      ),
    ]);

    res.json({
      success: true,
      data: {
        jobs: jobs.rows[0],
        alerts: alerts.rows[0],
        approvals: approvals.rows[0],
        tokensUsedToday: tokens.rows[0].total_tokens,
      },
    });
  })
);

// ── GET /thresholds — List confidence thresholds ─────────────────────

agentsRouter.get(
  '/thresholds',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;

    const result = await db.query(
      `select * from agent_confidence_thresholds where organization_id = $1 order by action_type`,
      [organizationId]
    );

    res.json({ success: true, data: result.rows });
  })
);

// ── PUT /thresholds/:actionType — Set confidence thresholds ──────────

const updateThresholdSchema = z.object({
  autoApproveThreshold: z.number().min(0).max(1),
  requireApprovalThreshold: z.number().min(0).max(1),
  rejectThreshold: z.number().min(0).max(1),
});

agentsRouter.put(
  '/thresholds/:actionType',
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    await requireAdminRole(userId, organizationId);
    const { actionType } = req.params;
    const VALID_ACTION_TYPES = [
      'send_counter_proposal',
      'send_email',
      'update_contract_status',
      'create_notification',
    ];
    if (!VALID_ACTION_TYPES.includes(actionType)) {
      throw new ApiError(
        `Invalid action type. Must be one of: ${VALID_ACTION_TYPES.join(', ')}`,
        400,
        'INVALID_ACTION_TYPE'
      );
    }
    const body = updateThresholdSchema.parse(req.body);

    if (
      body.rejectThreshold >= body.requireApprovalThreshold ||
      body.requireApprovalThreshold >= body.autoApproveThreshold
    ) {
      throw new ApiError(
        'Thresholds must be: reject < requireApproval < autoApprove',
        400,
        'INVALID_THRESHOLDS'
      );
    }

    const result = await db.query(
      `insert into agent_confidence_thresholds
         (organization_id, action_type, auto_approve_threshold, require_approval_threshold, reject_threshold)
       values ($1, $2, $3, $4, $5)
       on conflict (organization_id, action_type) do update set
         auto_approve_threshold = $3,
         require_approval_threshold = $4,
         reject_threshold = $5,
         updated_at = now()
       returning *`,
      [
        organizationId,
        actionType,
        body.autoApproveThreshold,
        body.requireApprovalThreshold,
        body.rejectThreshold,
      ]
    );

    res.json({ success: true, data: result.rows[0] });
  })
);
