import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { requestApproval } from '../../lib/approvalGate.js';
import { checkRateLimit } from '../../lib/rateLimit.js';
import {
  analyzeIncomingRedline,
  generateCounterPosition,
} from '../../agents/contractNegotiation.js';

export const negotiationsRouter = Router();

// ── Schemas ──────────────────────────────────────────────────────────

const createNegotiationSchema = z.object({
  contractId: z.string().uuid(),
  playbookId: z.string().uuid().optional(),
  counterpartyName: z.string().max(500).optional(),
});

const listNegotiationsQuerySchema = z.object({
  status: z.enum(['active', 'agreed', 'terminated', 'escalated']).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['active', 'agreed', 'terminated']),
});

const escalateSchema = z.object({
  escalateTo: z.string().uuid().optional(),
});

const recordTurnSchema = z.object({
  direction: z.enum(['incoming', 'outgoing']),
  content: z.string().max(100000).optional(),
  changes: z.array(z.object({ clause: z.string(), from: z.string(), to: z.string() })).optional(),
});

// ── POST / — Start a negotiation ─────────────────────────────────────

negotiationsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const body = createNegotiationSchema.parse(req.body);

    // Verify contract exists
    const contract = await db.query(
      `select id from contracts where id = $1 and organization_id = $2`,
      [body.contractId, organizationId]
    );
    if (!contract.rows[0]) throw new ApiError('Contract not found', 404, 'CONTRACT_NOT_FOUND');

    const result = await db.query(
      `insert into negotiations (organization_id, contract_id, playbook_id, counterparty_name, started_by, assigned_to)
       values ($1, $2, $3, $4, $5, $5)
       returning *`,
      [
        organizationId,
        body.contractId,
        body.playbookId ?? null,
        body.counterpartyName ?? null,
        userId,
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  })
);

// ── GET / — List negotiations ────────────────────────────────────────

negotiationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const query = listNegotiationsQuerySchema.parse(req.query);

    const conditions = ['n.organization_id = $1'];
    const params: unknown[] = [organizationId];

    if (query.status) {
      conditions.push(`n.status = $2`);
      params.push(query.status);
    }

    const result = await db.query(
      `select n.*, c.title as contract_title,
              p.name as playbook_name
       from negotiations n
       left join contracts c on c.id = n.contract_id
       left join negotiation_playbooks p on p.id = n.playbook_id
       where ${conditions.join(' and ')}
       order by n.updated_at desc`,
      params
    );

    res.json({ success: true, data: result.rows });
  })
);

// ── GET /:id — Get negotiation with turns and positions ──────────────

negotiationsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;

    const neg = await db.query(
      `select n.*, c.title as contract_title, c.content as contract_content,
              p.name as playbook_name, p.rules as playbook_rules
       from negotiations n
       left join contracts c on c.id = n.contract_id
       left join negotiation_playbooks p on p.id = n.playbook_id
       where n.id = $1 and n.organization_id = $2`,
      [req.params.id, organizationId]
    );

    if (!neg.rows[0]) throw new ApiError('Negotiation not found', 404, 'NOT_FOUND');

    const [turns, positions] = await Promise.all([
      db.query(
        `select * from negotiation_turns where negotiation_id = $1 order by round_number, created_at`,
        [req.params.id]
      ),
      db.query(
        `select * from negotiation_positions where negotiation_id = $1 order by clause_name`,
        [req.params.id]
      ),
    ]);

    res.json({
      success: true,
      data: { ...neg.rows[0], turns: turns.rows, positions: positions.rows },
    });
  })
);

// ── POST /:id/turns — Record a new turn ──────────────────────────────

negotiationsRouter.post(
  '/:id/turns',
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const rl = checkRateLimit(`neg-turns:${organizationId}`, 20, 60_000);
    if (!rl.allowed)
      throw new ApiError(
        `Rate limit exceeded. Retry after ${rl.retryAfter}s`,
        429,
        'RATE_LIMIT_EXCEEDED'
      );
    const body = recordTurnSchema.parse(req.body);

    const neg = await db.query(
      `select * from negotiations where id = $1 and organization_id = $2`,
      [req.params.id, organizationId]
    );
    if (!neg.rows[0]) throw new ApiError('Negotiation not found', 404, 'NOT_FOUND');

    const roundNumber = neg.rows[0].current_round + (body.direction === 'incoming' ? 1 : 0);

    // If incoming, run AI analysis
    let aiAnalysis = null;
    let aiConfidence = null;

    if (body.direction === 'incoming' && body.changes && body.changes.length > 0) {
      const result = await analyzeIncomingRedline(
        organizationId,
        req.params.id,
        body.content ?? '',
        body.changes
      );
      aiAnalysis = result.analysis;
      aiConfidence = ((result.analysis as Record<string, unknown>).confidence as number) ?? null;
    }

    const turn = await db.query(
      `insert into negotiation_turns
         (negotiation_id, round_number, direction, content, changes, ai_analysis, ai_confidence, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning *`,
      [
        req.params.id,
        roundNumber,
        body.direction,
        body.content ?? null,
        body.changes ? JSON.stringify(body.changes) : null,
        aiAnalysis ? JSON.stringify(aiAnalysis) : null,
        aiConfidence,
        userId,
      ]
    );

    // Update negotiation round and positions
    if (body.direction === 'incoming') {
      await db.query(
        `update negotiations set current_round = $1, their_last_position = $2, updated_at = now()
         where id = $3`,
        [roundNumber, body.changes ? JSON.stringify(body.changes) : null, req.params.id]
      );

      // Update position tracker
      if (body.changes) {
        for (const change of body.changes) {
          await db.query(
            `insert into negotiation_positions (negotiation_id, clause_name, their_position, rounds_discussed)
             values ($1, $2, $3, 1)
             on conflict (negotiation_id, clause_name)
               do update set their_position = $3, rounds_discussed = negotiation_positions.rounds_discussed + 1, updated_at = now()`,
            [req.params.id, change.clause, change.to]
          );
        }
      }
    }

    res.status(201).json({ success: true, data: turn.rows[0] });
  })
);

// ── POST /:id/ai-respond — Generate AI counter-position ─────────────

negotiationsRouter.post(
  '/:id/ai-respond',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const rl = checkRateLimit(`neg-ai:${organizationId}`, 10, 60_000);
    if (!rl.allowed)
      throw new ApiError(
        `Rate limit exceeded. Retry after ${rl.retryAfter}s`,
        429,
        'RATE_LIMIT_EXCEEDED'
      );

    const result = await generateCounterPosition(organizationId, req.params.id);

    const confidence = (result.counterProposal.confidence as number) ?? 0.7;

    // Route through approval gate
    const approval = await requestApproval({
      organizationId,
      requestedByAgent: 'contract_negotiation',
      actionType: 'send_counter_proposal',
      actionPayload: {
        negotiationId: req.params.id,
        counterProposal: result.counterProposal,
      },
      summary: `AI generated a counter-proposal for negotiation (confidence: ${Math.round(confidence * 100)}%)`,
      confidence,
    });

    res.json({
      success: true,
      data: {
        counterProposal: result.counterProposal,
        approval: {
          id: approval.approvalId,
          decision: approval.decision,
          executed: approval.executed,
        },
      },
    });
  })
);

// ── POST /:id/escalate — Escalate negotiation ───────────────────────

negotiationsRouter.post(
  '/:id/escalate',
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const body = escalateSchema.parse(req.body);
    const escalateTo = body.escalateTo;

    const result = await db.query(
      `update negotiations
       set status = 'escalated', escalated_to = $3, escalated_at = now(), updated_at = now()
       where id = $1 and organization_id = $2
       returning *`,
      [req.params.id, organizationId, escalateTo ?? null]
    );

    if (!result.rows[0]) throw new ApiError('Negotiation not found', 404, 'NOT_FOUND');

    res.json({ success: true, data: result.rows[0] });
  })
);

// ── PATCH /:id — Update negotiation status ───────────────────────────

negotiationsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const body = updateStatusSchema.parse(req.body);

    const result = await db.query(
      `update negotiations set status = $3, updated_at = now() where id = $1 and organization_id = $2 returning *`,
      [req.params.id, organizationId, body.status]
    );

    if (!result.rows[0]) throw new ApiError('Negotiation not found', 404, 'NOT_FOUND');
    res.json({ success: true, data: result.rows[0] });
  })
);
