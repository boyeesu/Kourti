import { db } from '../db/pool.js';

export interface ApprovalRequest {
  organizationId: string;
  jobId?: string;
  alertId?: string;
  requestedByAgent: string;
  actionType: string;
  actionPayload: Record<string, unknown>;
  summary: string;
  confidence: number;
  expiresInHours?: number;
}

export type ApprovalDecision = 'auto_approved' | 'auto_rejected' | 'pending_approval';

export interface ApprovalResult {
  decision: ApprovalDecision;
  approvalId: string;
  executed: boolean;
}

/**
 * Request approval for an agent action. Checks confidence thresholds
 * and either auto-approves, auto-rejects, or queues for human review.
 */
export async function requestApproval(params: ApprovalRequest): Promise<ApprovalResult> {
  const thresholds = await getThresholds(params.organizationId, params.actionType);

  let decision: ApprovalDecision;
  let status: string;

  if (params.confidence >= thresholds.autoApprove) {
    decision = 'auto_approved';
    status = 'approved';
  } else if (params.confidence < thresholds.reject) {
    decision = 'auto_rejected';
    status = 'rejected';
  } else {
    decision = 'pending_approval';
    status = 'pending';
  }

  const expiresAt = params.expiresInHours
    ? new Date(Date.now() + params.expiresInHours * 60 * 60 * 1000).toISOString()
    : new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(); // 72h default

  const result = await db.query(
    `insert into agent_approval_requests
       (organization_id, job_id, alert_id, requested_by_agent, action_type,
        action_payload, summary, confidence, status, expires_at,
        reviewed_at, executed_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
             case when $9 != 'pending' then now() else null end,
             case when $9 = 'approved' then now() else null end)
     returning id`,
    [
      params.organizationId,
      params.jobId ?? null,
      params.alertId ?? null,
      params.requestedByAgent,
      params.actionType,
      JSON.stringify(params.actionPayload),
      params.summary,
      params.confidence,
      status,
      expiresAt,
    ]
  );

  const approvalId = result.rows[0].id;

  // Audit log
  await db.query(
    `insert into agent_audit_logs (organization_id, action, details)
     values ($1, $2, $3)`,
    [
      params.organizationId,
      `approval_${decision}`,
      JSON.stringify({
        approvalId,
        actionType: params.actionType,
        confidence: params.confidence,
        decision,
        thresholds,
      }),
    ]
  );

  // If auto-approved, execute immediately
  let executed = false;
  if (decision === 'auto_approved') {
    executed = true;
    // Mark as executed — the caller handles the actual execution
  }

  return { decision, approvalId, executed };
}

/**
 * Execute an approved action (called after human approval or auto-approval).
 */
export async function markApprovalExecuted(
  approvalId: string,
  organizationId: string,
  executionResult: Record<string, unknown>
) {
  await db.query(
    `update agent_approval_requests
     set executed_at = now(), execution_result = $1
     where id = $2 and organization_id = $3 and status = 'approved'`,
    [JSON.stringify(executionResult), approvalId, organizationId]
  );
}

/**
 * Get confidence thresholds for an action type, falling back to defaults.
 */
async function getThresholds(
  organizationId: string,
  actionType: string
): Promise<{ autoApprove: number; requireApproval: number; reject: number }> {
  const result = await db.query(
    `select auto_approve_threshold, require_approval_threshold, reject_threshold
     from agent_confidence_thresholds
     where organization_id = $1 and action_type = $2`,
    [organizationId, actionType]
  );

  if (result.rows[0]) {
    return {
      autoApprove: parseFloat(result.rows[0].auto_approve_threshold),
      requireApproval: parseFloat(result.rows[0].require_approval_threshold),
      reject: parseFloat(result.rows[0].reject_threshold),
    };
  }

  return { autoApprove: 0.95, requireApproval: 0.7, reject: 0.3 };
}
