import type { Pool } from 'pg';

import { db } from '../db/pool.js';
import { requestChatCompletion } from './openai.js';

// ── Types ────────────────────────────────────────────────────────────

export interface StepResult {
  output: Record<string, unknown>;
  tokensUsed?: number;
  modelUsed?: string;
}

export interface StepContext {
  /** The pg connection pool — all queries must filter by organizationId */
  db: Pool;
  /** Organization scope */
  organizationId: string;
  /** User who triggered the job */
  userId: string;
  /** The agent_jobs.id */
  jobId: string;
  /** The original job input */
  jobInput: Record<string, unknown>;
  /** Accumulated outputs from previous steps, keyed by step name */
  previousSteps: Record<string, Record<string, unknown>>;
  /** Convenience wrapper around requestChatCompletion */
  llm: (
    systemPrompt: string,
    userPrompt: string,
    maxTokens?: number
  ) => Promise<{ analysis: string; tokensUsed: number; modelUsed: string }>;
  /** Write an audit log entry */
  auditLog: (
    action: string,
    details?: Record<string, unknown>,
    entityType?: string,
    entityId?: string
  ) => Promise<void>;
}

export interface AgentStep {
  name: string;
  execute: (ctx: StepContext) => Promise<StepResult>;
}

export interface AgentDefinition {
  name: string;
  steps: AgentStep[];
}

// ── Execution Engine ─────────────────────────────────────────────────

export async function executeAgent(jobId: string, definition: AgentDefinition) {
  // Load job from DB
  const jobRow = await db.query(
    `select id, organization_id, created_by, input, status from agent_jobs where id = $1`,
    [jobId]
  );

  if (!jobRow.rows[0]) {
    console.error(`[agent] Job ${jobId} not found`);
    return;
  }

  const job = jobRow.rows[0];

  if (job.status === 'cancelled') {
    console.log(`[agent] Job ${jobId} was cancelled, skipping`);
    return;
  }

  const organizationId: string = job.organization_id;
  const userId: string = job.created_by;
  const jobInput: Record<string, unknown> = job.input ?? {};

  // Mark job as running
  await db.query(
    `update agent_jobs set status = 'running', started_at = now(), updated_at = now() where id = $1`,
    [jobId]
  );

  await writeAuditLog(jobId, organizationId, userId, 'job_started', {
    agentType: definition.name,
    stepCount: definition.steps.length,
  });

  const previousSteps: Record<string, Record<string, unknown>> = {};
  let totalTokens = 0;

  for (let i = 0; i < definition.steps.length; i++) {
    const step = definition.steps[i];

    // Check if job was cancelled mid-execution
    const cancelCheck = await db.query(`select status from agent_jobs where id = $1`, [jobId]);
    if (cancelCheck.rows[0]?.status === 'cancelled') {
      console.log(`[agent] Job ${jobId} cancelled during step ${step.name}`);
      return;
    }

    // Create step record
    const stepRow = await db.query(
      `insert into agent_job_steps (job_id, step_name, step_index, status, started_at)
       values ($1, $2, $3, 'running', now())
       returning id`,
      [jobId, step.name, i]
    );
    const stepId = stepRow.rows[0].id;

    // Update job progress
    const progress = Math.round((i / definition.steps.length) * 100);
    await db.query(
      `update agent_jobs set progress = $1, progress_message = $2, updated_at = now() where id = $3`,
      [progress, `Running: ${step.name}`, jobId]
    );

    const stepStart = Date.now();

    try {
      const ctx: StepContext = {
        db,
        organizationId,
        userId,
        jobId,
        jobInput,
        previousSteps,
        llm: async (systemPrompt, userPrompt, maxTokens) => {
          // Enforce daily token budget
          const budgetResult = await db.query(
            `select coalesce(ac.daily_token_budget, 500000) as budget,
                    coalesce((select sum(s.tokens_used) from agent_job_steps s
                              join agent_jobs j on j.id = s.job_id
                              where j.organization_id = $1 and j.created_at > now() - interval '24 hours'), 0)::int as used
             from agent_configs ac where ac.organization_id = $1
             union all select 500000 as budget, 0 as used where not exists (select 1 from agent_configs where organization_id = $1)
             limit 1`,
            [organizationId]
          );
          const { budget, used } = budgetResult.rows[0] ?? { budget: 500000, used: 0 };
          if (used >= budget) {
            throw new Error(
              `Daily token budget exhausted (${used}/${budget}). Try again tomorrow.`
            );
          }

          return requestChatCompletion(
            [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            maxTokens
          );
        },
        auditLog: async (action, details, entityType, entityId) => {
          await writeAuditLog(jobId, organizationId, userId, action, details, entityType, entityId);
        },
      };

      const result = await step.execute(ctx);
      const durationMs = Date.now() - stepStart;
      const stepTokens = result.tokensUsed ?? 0;
      totalTokens += stepTokens;

      // Store step output for subsequent steps
      previousSteps[step.name] = result.output;

      // Mark step completed
      await db.query(
        `update agent_job_steps
         set status = 'completed', output = $1, tokens_used = $2, model_used = $3,
             duration_ms = $4, completed_at = now()
         where id = $5`,
        [JSON.stringify(result.output), stepTokens, result.modelUsed ?? null, durationMs, stepId]
      );

      await writeAuditLog(jobId, organizationId, userId, 'step_completed', {
        stepName: step.name,
        durationMs,
        tokensUsed: stepTokens,
      });
    } catch (err) {
      const durationMs = Date.now() - stepStart;
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Mark step failed
      await db.query(
        `update agent_job_steps
         set status = 'failed', error = $1, duration_ms = $2, completed_at = now()
         where id = $3`,
        [errorMessage, durationMs, stepId]
      );

      // Mark job failed
      await db.query(
        `update agent_jobs
         set status = 'failed', error = $1, completed_at = now(), updated_at = now()
         where id = $2`,
        [errorMessage, jobId]
      );

      await writeAuditLog(jobId, organizationId, userId, 'job_failed', {
        stepName: step.name,
        error: errorMessage,
        totalTokens,
      });

      console.error(`[agent] Job ${jobId} failed at step "${step.name}":`, errorMessage);
      return;
    }
  }

  // Mark job completed
  await db.query(
    `update agent_jobs
     set status = 'completed', progress = 100, progress_message = 'Complete',
         completed_at = now(), updated_at = now()
     where id = $1`,
    [jobId]
  );

  await writeAuditLog(jobId, organizationId, userId, 'job_completed', {
    agentType: definition.name,
    totalTokens,
  });

  console.log(`[agent] Job ${jobId} (${definition.name}) completed — ${totalTokens} tokens used`);
}

// ── Helpers ──────────────────────────────────────────────────────────

async function writeAuditLog(
  jobId: string | null,
  organizationId: string,
  userId: string | null,
  action: string,
  details?: Record<string, unknown>,
  entityType?: string,
  entityId?: string
) {
  await db.query(
    `insert into agent_audit_logs (job_id, organization_id, user_id, action, entity_type, entity_id, details)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      jobId,
      organizationId,
      userId,
      action,
      entityType ?? null,
      entityId ?? null,
      details ? JSON.stringify(details) : null,
    ]
  );
}
