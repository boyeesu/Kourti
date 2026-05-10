import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';

export const playbooksRouter = Router();

// ── Playbook prompt templates (system + user) ────────────────────────
//
// Distinct from the rules-based negotiation_playbooks above: these are
// free-text AI prompt templates (e.g. "Generate CP Checklist") that drive
// the chat assistant or the tabular review engine. System templates are
// global (organization_id IS NULL, is_system = true) and seeded by
// migration.

const playbookTemplateKindSchema = z.enum(['assistant', 'tabular']);

const createTemplateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  kind: playbookTemplateKindSchema.default('assistant'),
  prompt_md: z.string().min(1),
  columns_config: z.array(z.record(z.string(), z.unknown())).optional(),
  practice: z.string().trim().max(120).optional(),
});

const listTemplateQuerySchema = z.object({
  kind: playbookTemplateKindSchema.optional(),
  /** include_system defaults to true; pass false to see only org templates */
  include_system: z.coerce.boolean().default(true),
});

// GET /templates — list available templates (system + this org's)
playbooksRouter.get(
  '/templates',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const q = listTemplateQuerySchema.parse(req.query);

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (q.include_system) {
      params.push(organizationId);
      conditions.push(`(is_system = true or organization_id = $${params.length})`);
    } else {
      params.push(organizationId);
      conditions.push(`organization_id = $${params.length}`);
    }
    if (q.kind) {
      params.push(q.kind);
      conditions.push(`kind = $${params.length}`);
    }

    const result = await db.query(
      `select id, organization_id, is_system, slug, title, description, kind,
              prompt_md, columns_config, practice, created_at, updated_at
         from public.playbook_templates
        where ${conditions.join(' and ')}
        order by is_system desc, title asc`,
      params
    );
    res.json({ success: true, data: result.rows });
  })
);

// GET /templates/:id — single template (system or owned)
playbooksRouter.get(
  '/templates/:id',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const result = await db.query(
      `select * from public.playbook_templates
        where id = $1 and (is_system = true or organization_id = $2)`,
      [req.params.id, organizationId]
    );
    if (!result.rows[0]) throw new ApiError('Template not found', 404, 'NOT_FOUND');
    res.json({ success: true, data: result.rows[0] });
  })
);

// POST /templates — create org template
playbooksRouter.post(
  '/templates',
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const body = createTemplateSchema.parse(req.body);

    const result = await db.query(
      `insert into public.playbook_templates
         (organization_id, created_by, is_system, title, description, kind, prompt_md, columns_config, practice)
       values ($1, $2, false, $3, $4, $5, $6, $7, $8)
       returning *`,
      [
        organizationId,
        userId,
        body.title,
        body.description ?? null,
        body.kind,
        body.prompt_md,
        body.columns_config ? JSON.stringify(body.columns_config) : null,
        body.practice ?? null,
      ]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  })
);

// PUT /templates/:id — update org template (system templates are read-only)
playbooksRouter.put(
  '/templates/:id',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const body = createTemplateSchema.partial().parse(req.body);

    const result = await db.query(
      `update public.playbook_templates
          set title          = coalesce($3, title),
              description    = coalesce($4, description),
              kind           = coalesce($5, kind),
              prompt_md      = coalesce($6, prompt_md),
              columns_config = coalesce($7::jsonb, columns_config),
              practice       = coalesce($8, practice),
              updated_at     = now()
        where id = $1 and organization_id = $2 and is_system = false
        returning *`,
      [
        req.params.id,
        organizationId,
        body.title ?? null,
        body.description ?? null,
        body.kind ?? null,
        body.prompt_md ?? null,
        body.columns_config ? JSON.stringify(body.columns_config) : null,
        body.practice ?? null,
      ]
    );
    if (!result.rows[0]) throw new ApiError('Template not found or not editable', 404, 'NOT_FOUND');
    res.json({ success: true, data: result.rows[0] });
  })
);

// DELETE /templates/:id — delete org template (cannot delete system)
playbooksRouter.delete(
  '/templates/:id',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const result = await db.query(
      `delete from public.playbook_templates
        where id = $1 and organization_id = $2 and is_system = false
        returning id`,
      [req.params.id, organizationId]
    );
    if (!result.rows[0])
      throw new ApiError('Template not found or not deletable', 404, 'NOT_FOUND');
    res.json({ success: true, data: { deleted: true } });
  })
);

// ── Negotiation playbooks (rules-based) ──────────────────────────────
//
// `rules` is a typed list of negotiating positions. Each rule scopes a
// single clause and tells the negotiation agent how aggressively to push
// back. The agent reads these in [agents/contractNegotiation.ts] and
// passes them to the LLM as part of the system prompt.
//
// `escalation_config` controls when to bump the negotiation up to a
// senior reviewer instead of auto-replying.

const negotiationRuleSchema = z
  .object({
    /** Clause this rule applies to, e.g. "Liability cap", "Governing law". */
    clause: z.string().trim().min(1).max(200),
    /**
     * - must_have: a non-negotiable. Agent rejects deviations.
     * - preferred: agent counters, willing to concede if pushed.
     * - walk_away: presence of a non-conforming position triggers
     *              escalation regardless of confidence.
     */
    position: z.enum(['must_have', 'preferred', 'walk_away']),
    /** Free-text instruction expanded into the LLM system prompt. */
    guidance: z.string().trim().min(1).max(2000),
    /** Optional fallback position to offer if the primary is rejected. */
    fallback: z.string().trim().max(2000).optional(),
    /** Optional numeric threshold, e.g. { metric: "cap_multiple", value: 1.5 }. */
    threshold: z
      .object({
        metric: z.string().trim().min(1).max(80),
        value: z.number(),
        operator: z.enum(['lte', 'gte', 'eq']).default('lte'),
      })
      .optional(),
  })
  .passthrough(); // allow extra metadata without breaking older rows

const escalationConfigSchema = z
  .object({
    /** Auto-approve threshold (0-1). Below this, route to a human reviewer. */
    auto_approve_threshold: z.number().min(0).max(1).optional(),
    /** Email/userId to escalate to when triggered. */
    escalate_to: z.string().trim().max(200).optional(),
    /** Slack/Teams webhook for escalation notifications. */
    notify_webhook: z.string().url().optional(),
  })
  .passthrough();

const createPlaybookSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  contractTypes: z.array(z.string()).optional(),
  rules: z.array(negotiationRuleSchema).optional(),
  escalationConfig: escalationConfigSchema.optional(),
  isDefault: z.boolean().optional(),
});

// ── GET / — List playbooks ───────────────────────────────────────────

playbooksRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;

    const result = await db.query(
      `select * from negotiation_playbooks where organization_id = $1 order by is_default desc, name`,
      [organizationId]
    );

    res.json({ success: true, data: result.rows });
  })
);

// ── GET /:id — Get playbook ─────────────────────────────────────────

playbooksRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;

    const result = await db.query(
      `select * from negotiation_playbooks where id = $1 and organization_id = $2`,
      [req.params.id, organizationId]
    );

    if (!result.rows[0]) throw new ApiError('Playbook not found', 404, 'NOT_FOUND');
    res.json({ success: true, data: result.rows[0] });
  })
);

// ── POST / — Create playbook ────────────────────────────────────────

playbooksRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const body = createPlaybookSchema.parse(req.body);

    const result = await db.query(
      `insert into negotiation_playbooks
         (organization_id, name, description, contract_types, rules, escalation_config, is_default, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning *`,
      [
        organizationId,
        body.name,
        body.description ?? null,
        body.contractTypes ?? null,
        JSON.stringify(body.rules ?? []),
        body.escalationConfig ? JSON.stringify(body.escalationConfig) : null,
        body.isDefault ?? false,
        userId,
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  })
);

// ── PUT /:id — Update playbook ──────────────────────────────────────

playbooksRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const body = createPlaybookSchema.parse(req.body);

    const result = await db.query(
      `update negotiation_playbooks
       set name = $3, description = $4, contract_types = $5, rules = $6,
           escalation_config = $7, is_default = $8, updated_at = now()
       where id = $1 and organization_id = $2
       returning *`,
      [
        req.params.id,
        organizationId,
        body.name,
        body.description ?? null,
        body.contractTypes ?? null,
        JSON.stringify(body.rules ?? []),
        body.escalationConfig ? JSON.stringify(body.escalationConfig) : null,
        body.isDefault ?? false,
      ]
    );

    if (!result.rows[0]) throw new ApiError('Playbook not found', 404, 'NOT_FOUND');
    res.json({ success: true, data: result.rows[0] });
  })
);

// ── DELETE /:id — Delete playbook ───────────────────────────────────

playbooksRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;

    const result = await db.query(
      `delete from negotiation_playbooks where id = $1 and organization_id = $2 returning id`,
      [req.params.id, organizationId]
    );

    if (!result.rows[0]) throw new ApiError('Playbook not found', 404, 'NOT_FOUND');
    res.json({ success: true, data: { deleted: true } });
  })
);
