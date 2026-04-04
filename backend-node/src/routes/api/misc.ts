/**
 * Miscellaneous endpoints for smaller domains:
 * activity types, client logs, dashboard prefs, saved searches,
 * bulk actions, contract templates, onboarding, voice transcriptions,
 * subscriptions, user plans.
 */
import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';

const uuidLike = z.string().regex(/^[0-9a-fA-F-]{36}$/);

export const miscRouter = Router();

// ── Activity types ──────────────────────────────────────────────────────────

miscRouter.get(
  '/activity-types',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db
      .query(
        `select distinct activity_type from public.case_activities where activity_type is not null and organization_id = $1`,
        [auth.organizationId]
      )
      .catch(() => ({ rows: [] }));

    res
      .status(200)
      .json(result.rows.map((r: Record<string, unknown>) => r.activity_type as string));
  })
);

// ── Client logs ─────────────────────────────────────────────────────────────

miscRouter.get(
  '/client-logs/:clientId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { clientId } = z.object({ clientId: uuidLike }).parse(req.params);

    const result = await db.query(
      `select * from public.communication_logs where client_id = $1 and organization_id = $2 order by created_at desc`,
      [clientId, auth.organizationId]
    );

    res.status(200).json(result.rows);
  })
);

miscRouter.post(
  '/client-logs',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = z
      .object({
        client_id: uuidLike,
        type: z.string().trim().min(1),
        content: z.string().trim().min(1),
      })
      .parse(req.body);

    const result = await db.query(
      `insert into public.communication_logs (client_id, user_id, organization_id, type, content, created_at) values ($1,$2,$3,$4,$5,now()) returning *`,
      [body.client_id, auth.userId, auth.organizationId, body.type, body.content]
    );

    res.status(201).json(result.rows[0]);
  })
);

// ── Dashboard prefs ─────────────────────────────────────────────────────────

miscRouter.get(
  '/dashboard-prefs',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db
      .query(
        `select * from public.dashboard_prefs where user_id = $1 and organization_id = $2 limit 1`,
        [auth.userId, auth.organizationId]
      )
      .catch(() => ({ rows: [] }));

    res.status(200).json(
      result.rows[0] ?? {
        show_upcoming_cases: true,
        show_upcoming_contracts: true,
        reminder_window_days: 90,
      }
    );
  })
);

miscRouter.put(
  '/dashboard-prefs',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = z
      .object({
        show_upcoming_cases: z.boolean().optional(),
        show_upcoming_contracts: z.boolean().optional(),
        reminder_window_days: z.number().int().optional(),
      })
      .parse(req.body);

    const result = await db
      .query(
        `insert into public.dashboard_prefs (user_id, organization_id, show_upcoming_cases, show_upcoming_contracts, reminder_window_days)
       values ($1, $2, $3, $4, $5)
       on conflict (user_id, organization_id) do update set
         show_upcoming_cases = coalesce(excluded.show_upcoming_cases, public.dashboard_prefs.show_upcoming_cases),
         show_upcoming_contracts = coalesce(excluded.show_upcoming_contracts, public.dashboard_prefs.show_upcoming_contracts),
         reminder_window_days = coalesce(excluded.reminder_window_days, public.dashboard_prefs.reminder_window_days)
       returning *`,
        [
          auth.userId,
          auth.organizationId,
          body.show_upcoming_cases ?? true,
          body.show_upcoming_contracts ?? true,
          body.reminder_window_days ?? 90,
        ]
      )
      .catch(() => ({ rows: [body] }));

    res.status(200).json(result.rows[0]);
  })
);

// ── Saved searches ──────────────────────────────────────────────────────────

miscRouter.get(
  '/saved-searches',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db
      .query(
        `select * from public.saved_searches where organization_id = $1 order by created_at desc`,
        [auth.organizationId]
      )
      .catch(() => ({ rows: [] }));

    res.status(200).json(result.rows);
  })
);

miscRouter.post(
  '/saved-searches',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = z
      .object({
        name: z.string().trim().min(1),
        query: z.string(),
        filters: z.record(z.string(), z.unknown()).default({}),
        resource_type: z.enum(['cases', 'documents', 'clients', 'contracts']),
      })
      .parse(req.body);

    const result = await db.query(
      `insert into public.saved_searches (organization_id, name, query, filters, resource_type, created_at) values ($1,$2,$3,$4,$5,now()) returning *`,
      [auth.organizationId, body.name, body.query, JSON.stringify(body.filters), body.resource_type]
    );

    res.status(201).json(result.rows[0]);
  })
);

miscRouter.delete(
  '/saved-searches/:searchId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { searchId } = z.object({ searchId: uuidLike }).parse(req.params);

    await db.query(`delete from public.saved_searches where id = $1 and organization_id = $2`, [
      searchId,
      auth.organizationId,
    ]);

    res.status(204).send();
  })
);

// ── Bulk actions (cases + clients) ──────────────────────────────────────────

miscRouter.post(
  '/bulk/cases',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = z
      .object({
        ids: z.array(uuidLike).min(1),
        action: z.object({
          type: z.enum(['delete', 'setStatus']),
          status: z.string().optional(),
        }),
      })
      .parse(req.body);

    if (body.action.type === 'delete') {
      await db.query(
        `delete from public.cases where id = any($1::uuid[]) and organization_id = $2`,
        [body.ids, auth.organizationId]
      );
    } else if (body.action.type === 'setStatus' && body.action.status) {
      await db.query(
        `update public.cases set status = $1, updated_at = now() where id = any($2::uuid[]) and organization_id = $3`,
        [body.action.status, body.ids, auth.organizationId]
      );
    }

    res.status(200).json({ success: true });
  })
);

miscRouter.post(
  '/bulk/clients',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = z
      .object({
        ids: z.array(uuidLike).min(1),
        action: z.object({
          type: z.enum(['delete', 'setStatus']),
          status: z.string().optional(),
        }),
      })
      .parse(req.body);

    if (body.action.type === 'delete') {
      await db.query(
        `delete from public.clients where id = any($1::uuid[]) and organization_id = $2`,
        [body.ids, auth.organizationId]
      );
    } else if (body.action.status) {
      await db.query(
        `update public.clients set status = $1, updated_at = now() where id = any($2::uuid[]) and organization_id = $3`,
        [body.action.status, body.ids, auth.organizationId]
      );
    }

    res.status(200).json({ success: true });
  })
);

// ── Contract templates ──────────────────────────────────────────────────────

miscRouter.get(
  '/contract-templates',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db
      .query(
        `select * from public.contract_templates where organization_id = $1 or is_public = true order by name`,
        [auth.organizationId]
      )
      .catch(() => ({ rows: [] }));

    res.status(200).json(result.rows);
  })
);

miscRouter.post(
  '/contract-templates',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = z
      .object({
        name: z.string().trim().min(1),
        description: z.string().optional(),
        template_content: z.string(),
        contract_type: z.string(),
        is_public: z.boolean().default(false),
      })
      .parse(req.body);

    const result = await db.query(
      `insert into public.contract_templates (name, description, template_content, contract_type, is_public, organization_id, created_by, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,now(),now()) returning *`,
      [
        body.name,
        body.description || null,
        body.template_content,
        body.contract_type,
        body.is_public,
        auth.organizationId,
        auth.userId,
      ]
    );

    res.status(201).json(result.rows[0]);
  })
);

// ── Onboarding status (combined login count + steps) ───────────────────────

miscRouter.get(
  '/onboarding-status',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const [loginResult, stepsResult] = await Promise.all([
      db.query(`SELECT login_count FROM public.auth_users WHERE id = $1`, [auth.userId]),
      db
        .query(
          `SELECT * FROM public.user_onboarding_steps WHERE user_id = $1 AND organization_id = $2 ORDER BY created_at ASC`,
          [auth.userId, auth.organizationId]
        )
        .catch(() => ({ rows: [] })),
    ]);

    const loginCount = (loginResult.rows[0]?.login_count as number) ?? 0;

    res.status(200).json({
      loginCount,
      steps: stepsResult.rows,
      showChecklist: loginCount <= 3,
    });
  })
);

// ── Onboarding steps ────────────────────────────────────────────────────────

miscRouter.get(
  '/onboarding-steps',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db
      .query(
        `select * from public.user_onboarding_steps where user_id = $1 and organization_id = $2 order by created_at asc`,
        [auth.userId, auth.organizationId]
      )
      .catch(() => ({ rows: [] }));

    res.status(200).json(result.rows);
  })
);

miscRouter.put(
  '/onboarding-steps/:stepName',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { stepName } = z.object({ stepName: z.string().trim().min(1) }).parse(req.params);
    const body = z
      .object({ metadata: z.record(z.string(), z.unknown()).optional() })
      .parse(req.body);

    const result = await db.query(
      `insert into public.user_onboarding_steps (user_id, organization_id, step_name, completed, completed_at, metadata)
       values ($1, $2, $3, true, now(), $4)
       on conflict (user_id, step_name) do update set completed = true, completed_at = now(), metadata = coalesce(excluded.metadata, public.user_onboarding_steps.metadata)
       returning *`,
      [
        auth.userId,
        auth.organizationId,
        stepName,
        body.metadata ? JSON.stringify(body.metadata) : null,
      ]
    );

    res.status(200).json(result.rows[0]);
  })
);

// ── Voice transcriptions ────────────────────────────────────────────────────

miscRouter.get(
  '/voice-transcriptions',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db.query(
      `select id, title, transcript, summary, case_id, duration_seconds, status, created_at, updated_at
       from public.voice_transcriptions where organization_id = $1 order by created_at desc`,
      [auth.organizationId]
    );

    res.status(200).json(result.rows);
  })
);

miscRouter.get(
  '/voice-transcriptions/:transcriptionId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { transcriptionId } = z.object({ transcriptionId: uuidLike }).parse(req.params);

    const result = await db.query(
      `select id, title, transcript, summary, case_id, duration_seconds, status, created_at, updated_at
       from public.voice_transcriptions where id = $1 and organization_id = $2 limit 1`,
      [transcriptionId, auth.organizationId]
    );

    res.status(200).json(result.rows[0] || null);
  })
);

miscRouter.post(
  '/voice-transcriptions',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = z
      .object({
        title: z.string().trim().min(1),
        transcript: z.string(),
        summary: z.string().optional(),
        case_id: uuidLike.optional(),
        duration_seconds: z.number().optional(),
        status: z.string().default('completed'),
      })
      .parse(req.body);

    const result = await db.query(
      `insert into public.voice_transcriptions (title, transcript, summary, case_id, duration_seconds, status, organization_id, created_by, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now(),now()) returning *`,
      [
        body.title,
        body.transcript,
        body.summary || null,
        body.case_id || null,
        body.duration_seconds || null,
        body.status,
        auth.organizationId,
        auth.userId,
      ]
    );

    res.status(201).json(result.rows[0]);
  })
);

miscRouter.patch(
  '/voice-transcriptions/:transcriptionId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { transcriptionId } = z.object({ transcriptionId: uuidLike }).parse(req.params);
    const body = z
      .object({
        title: z.string().optional(),
        transcript: z.string().optional(),
        summary: z.string().optional(),
        case_id: uuidLike.optional(),
        status: z.string().optional(),
      })
      .parse(req.body);

    const updates: Array<{ col: string; val: unknown }> = [];
    if (body.title !== undefined) updates.push({ col: 'title', val: body.title });
    if (body.transcript !== undefined) updates.push({ col: 'transcript', val: body.transcript });
    if (body.summary !== undefined) updates.push({ col: 'summary', val: body.summary });
    if (body.case_id !== undefined) updates.push({ col: 'case_id', val: body.case_id });
    if (body.status !== undefined) updates.push({ col: 'status', val: body.status });

    if (!updates.length) {
      throw new ApiError('No fields to update', 400, 'VALIDATION_ERROR');
    }

    const setClause = updates.map((u, i) => `${u.col} = $${i + 1}`).join(', ');
    const values = updates.map((u) => u.val);

    const result = await db.query(
      `update public.voice_transcriptions set ${setClause}, updated_at = now() where id = $${values.length + 1} and organization_id = $${values.length + 2} returning *`,
      [...values, transcriptionId, auth.organizationId]
    );

    if (!result.rows[0]) throw new ApiError('Transcription not found', 404, 'NOT_FOUND');
    res.status(200).json(result.rows[0]);
  })
);

miscRouter.delete(
  '/voice-transcriptions/:transcriptionId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { transcriptionId } = z.object({ transcriptionId: uuidLike }).parse(req.params);

    await db.query(
      `delete from public.voice_transcriptions where id = $1 and organization_id = $2`,
      [transcriptionId, auth.organizationId]
    );

    res.status(204).send();
  })
);

// ── Subscriptions ───────────────────────────────────────────────────────────

miscRouter.get(
  '/subscriptions/current',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db
      .query(
        `select * from public.subscriptions where organization_id = $1 and status = 'active' order by created_at desc limit 1`,
        [auth.organizationId]
      )
      .catch(() => ({ rows: [] }));

    res.status(200).json(result.rows[0] || null);
  })
);

miscRouter.get(
  '/subscriptions/payments',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const limit = Number(req.query.limit) || 20;

    const result = await db
      .query(
        `select * from public.payment_transactions where organization_id = $1 order by created_at desc limit $2`,
        [auth.organizationId, limit]
      )
      .catch(() => ({ rows: [] }));

    res.status(200).json(result.rows);
  })
);

// ── User plans ──────────────────────────────────────────────────────────────

miscRouter.get(
  '/user-plans',
  asyncHandler(async (_req, res) => {
    const result = await db
      .query(`select * from public.user_plans where is_active = true order by plan_type asc`)
      .catch(() => ({ rows: [] }));

    res.status(200).json(
      result.rows.map((p: Record<string, unknown>) => ({
        ...p,
        features: p.features || [],
      }))
    );
  })
);

miscRouter.get(
  '/user-plans/current',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db
      .query(
        `select upa.id as assignment_id, upa.user_id, up.id as plan_id, up.name as plan_name,
              up.display_name as plan_display_name, up.plan_type, up.features,
              upa.starts_at, upa.expires_at, upa.status
       from public.user_plan_assignments upa
       join public.user_plans up on up.id = upa.plan_id
       where upa.user_id = $1 and upa.status = 'active'
       order by upa.created_at desc limit 1`,
        [auth.userId]
      )
      .catch(() => ({ rows: [] }));

    res.status(200).json(result.rows[0] || null);
  })
);

// ── Case types ──────────────────────────────────────────────────────────────

miscRouter.get(
  '/case-types',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const result = await db
      .query(`SELECT * FROM public.case_types WHERE organization_id = $1 ORDER BY name`, [
        auth.organizationId,
      ])
      .catch(() => ({ rows: [] }));
    res.status(200).json(result.rows);
  })
);

miscRouter.post(
  '/case-types',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = z
      .object({ name: z.string().trim().min(1), description: z.string().optional() })
      .parse(req.body);
    const result = await db.query(
      `INSERT INTO public.case_types (name, description, organization_id, created_by, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now()) RETURNING *`,
      [body.name, body.description || null, auth.organizationId, auth.userId]
    );
    res.status(201).json(result.rows[0]);
  })
);

// ── Case fields ─────────────────────────────────────────────────────────────

miscRouter.get(
  '/case-fields',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const caseTypeId = typeof req.query.caseTypeId === 'string' ? req.query.caseTypeId : undefined;
    const clauses = ['organization_id = $1'];
    const values: unknown[] = [auth.organizationId];
    if (caseTypeId) {
      values.push(caseTypeId);
      clauses.push(`case_type_id = $${values.length}`);
    }
    const result = await db
      .query(
        `SELECT * FROM public.case_fields WHERE ${clauses.join(' AND ')} ORDER BY sort_order, created_at`,
        values
      )
      .catch(() => ({ rows: [] }));
    res.status(200).json(result.rows);
  })
);

miscRouter.post(
  '/case-fields',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = z
      .object({
        case_type_id: uuidLike,
        name: z.string().trim().min(1),
        field_type: z.string().default('text'),
        required: z.boolean().default(false),
        options: z.array(z.string()).optional(),
        sort_order: z.number().int().optional(),
      })
      .parse(req.body);
    const result = await db.query(
      `INSERT INTO public.case_fields (case_type_id, organization_id, name, field_type, required, options, sort_order, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now(),now()) RETURNING *`,
      [
        body.case_type_id,
        auth.organizationId,
        body.name,
        body.field_type,
        body.required,
        body.options ? JSON.stringify(body.options) : null,
        body.sort_order || 0,
      ]
    );
    res.status(201).json(result.rows[0]);
  })
);

miscRouter.patch(
  '/case-fields/:fieldId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { fieldId } = z.object({ fieldId: uuidLike }).parse(req.params);
    const body = req.body as Record<string, unknown>;
    const allowed = ['name', 'field_type', 'required', 'options', 'sort_order'];
    const updates: Array<{ col: string; val: unknown }> = [];
    for (const f of allowed) {
      if (body[f] !== undefined)
        updates.push({ col: f, val: f === 'options' ? JSON.stringify(body[f]) : body[f] });
    }
    if (!updates.length) {
      res.status(200).json({});
      return;
    }
    const setClause = updates.map((u, i) => `${u.col} = $${i + 1}`).join(', ');
    const values = updates.map((u) => u.val);
    const result = await db.query(
      `UPDATE public.case_fields SET ${setClause}, updated_at = now() WHERE id = $${values.length + 1} AND organization_id = $${values.length + 2} RETURNING *`,
      [...values, fieldId, auth.organizationId]
    );
    res.status(200).json(result.rows[0] || null);
  })
);

miscRouter.delete(
  '/case-fields/:fieldId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { fieldId } = z.object({ fieldId: uuidLike }).parse(req.params);
    await db.query('DELETE FROM public.case_fields WHERE id = $1 AND organization_id = $2', [
      fieldId,
      auth.organizationId,
    ]);
    res.status(204).send();
  })
);

// ── Case issues ─────────────────────────────────────────────────────────────

miscRouter.get(
  '/case-issues',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const caseId = typeof req.query.caseId === 'string' ? req.query.caseId : undefined;
    const caseTypeId = typeof req.query.caseTypeId === 'string' ? req.query.caseTypeId : undefined;
    const clauses = ['organization_id = $1'];
    const values: unknown[] = [auth.organizationId];
    if (caseId) {
      values.push(caseId);
      clauses.push(`case_id = $${values.length}`);
    }
    if (caseTypeId) {
      values.push(caseTypeId);
      clauses.push(`case_type_id = $${values.length}`);
    }
    const result = await db
      .query(
        `SELECT * FROM public.case_issues WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`,
        values
      )
      .catch(() => ({ rows: [] }));
    res.status(200).json(result.rows);
  })
);

// ── Case activities ─────────────────────────────────────────────────────────

miscRouter.get(
  '/case-activities',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const caseId = typeof req.query.caseId === 'string' ? req.query.caseId : undefined;
    const clauses = ['ca.organization_id = $1'];
    const values: unknown[] = [auth.organizationId];
    if (caseId) {
      values.push(caseId);
      clauses.push(`ca.case_id = $${values.length}`);
    }
    const result = await db
      .query(
        `SELECT ca.*, p.first_name, p.last_name, p.email as user_email FROM public.case_activities ca LEFT JOIN public.profiles p ON p.user_id = ca.user_id WHERE ${clauses.join(' AND ')} ORDER BY ca.created_at DESC`,
        values
      )
      .catch(() => ({ rows: [] }));
    res.status(200).json(result.rows);
  })
);

miscRouter.post(
  '/case-activities',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = z
      .object({
        case_id: uuidLike,
        activity_type: z.string().trim().min(1),
        title: z.string().trim().min(1),
        description: z.string().optional(),
        date: z.string().optional(),
        duration_minutes: z.number().int().optional(),
        billable: z.boolean().optional(),
      })
      .parse(req.body);
    const result = await db.query(
      `INSERT INTO public.case_activities (case_id, organization_id, user_id, activity_type, title, description, date, duration_minutes, billable, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now()) RETURNING *`,
      [
        body.case_id,
        auth.organizationId,
        auth.userId,
        body.activity_type,
        body.title,
        body.description || null,
        body.date || new Date().toISOString(),
        body.duration_minutes || null,
        body.billable || false,
      ]
    );
    res.status(201).json(result.rows[0]);
  })
);

miscRouter.patch(
  '/case-activities/:activityId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { activityId } = z.object({ activityId: uuidLike }).parse(req.params);
    const body = req.body as Record<string, unknown>;
    const allowed = [
      'activity_type',
      'title',
      'description',
      'date',
      'duration_minutes',
      'billable',
    ];
    const updates: Array<{ col: string; val: unknown }> = [];
    for (const f of allowed) {
      if (body[f] !== undefined) updates.push({ col: f, val: body[f] });
    }
    if (!updates.length) {
      res.status(200).json({});
      return;
    }
    const setClause = updates.map((u, i) => `${u.col} = $${i + 1}`).join(', ');
    const values = updates.map((u) => u.val);
    const result = await db.query(
      `UPDATE public.case_activities SET ${setClause}, updated_at = now() WHERE id = $${values.length + 1} AND organization_id = $${values.length + 2} RETURNING *`,
      [...values, activityId, auth.organizationId]
    );
    res.status(200).json(result.rows[0] || null);
  })
);

miscRouter.delete(
  '/case-activities/:activityId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { activityId } = z.object({ activityId: uuidLike }).parse(req.params);
    await db.query('DELETE FROM public.case_activities WHERE id = $1 AND organization_id = $2', [
      activityId,
      auth.organizationId,
    ]);
    res.status(204).send();
  })
);

// ── SSO config ──────────────────────────────────────────────────────────────

miscRouter.get(
  '/sso-config',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const result = await db
      .query(`SELECT * FROM public.organization_sso_configs WHERE organization_id = $1`, [
        auth.organizationId,
      ])
      .catch(() => ({ rows: [] }));
    res.status(200).json(result.rows);
  })
);

miscRouter.post(
  '/sso-config/manage',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { action, payload } = req.body;

    if (!action || !payload) {
      return res.status(400).json({ error: 'Missing action or payload' });
    }

    const ssoKey = (await import('../../config/env.js')).env.SSO_SECRET_KEY;

    switch (action) {
      case 'create': {
        const { provider, clientId, clientSecret, tenantId, domainHint, redirectUri, isEnabled } =
          payload;
        const result = await db.query(
          `INSERT INTO public.organization_sso_configs
            (organization_id, provider, client_id, client_secret, tenant_id, domain_hint, redirect_uri, is_enabled, created_by, updated_by)
           VALUES ($1, $2, $3,
             CASE WHEN $4::text IS NOT NULL THEN pgp_sym_encrypt($4::text, $8::text) ELSE NULL END,
             $5, $6, $7, $9, $10, $10)
           RETURNING id, organization_id, provider, client_id, tenant_id, domain_hint, redirect_uri, is_enabled,
             client_secret IS NOT NULL AS has_client_secret,
             CASE WHEN client_secret IS NOT NULL THEN '••••••••' ELSE NULL END AS client_secret_masked,
             created_by, updated_by, created_at, updated_at`,
          [
            auth.organizationId,
            provider,
            clientId,
            clientSecret || null,
            tenantId || null,
            domainHint || null,
            redirectUri || null,
            ssoKey,
            isEnabled ?? false,
            auth.userId,
          ]
        );
        return res.status(200).json({ data: result.rows[0] });
      }

      case 'update': {
        const { id, clientId, clientSecret, tenantId, domainHint, redirectUri, isEnabled } =
          payload;
        const result = await db.query(
          `UPDATE public.organization_sso_configs
           SET
             client_id = COALESCE($2, client_id),
             client_secret = CASE WHEN $3::text IS NOT NULL AND $3::text != '' THEN pgp_sym_encrypt($3::text, $8::text) ELSE client_secret END,
             tenant_id = $4,
             domain_hint = $5,
             redirect_uri = $6,
             is_enabled = COALESCE($7, is_enabled),
             updated_by = $9,
             updated_at = timezone('utc', now())
           WHERE id = $1 AND organization_id = $10
           RETURNING id, organization_id, provider, client_id, tenant_id, domain_hint, redirect_uri, is_enabled,
             client_secret IS NOT NULL AS has_client_secret,
             CASE WHEN client_secret IS NOT NULL THEN '••••••••' ELSE NULL END AS client_secret_masked,
             created_by, updated_by, created_at, updated_at`,
          [
            id,
            clientId,
            clientSecret || null,
            tenantId ?? null,
            domainHint ?? null,
            redirectUri ?? null,
            isEnabled,
            ssoKey,
            auth.userId,
            auth.organizationId,
          ]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'SSO config not found' });
        }
        return res.status(200).json({ data: result.rows[0] });
      }

      case 'delete': {
        const { id } = payload;
        await db.query(
          `DELETE FROM public.organization_sso_configs WHERE id = $1 AND organization_id = $2`,
          [id, auth.organizationId]
        );
        return res.status(200).json({ data: true });
      }

      case 'rotate': {
        const { id, clientSecret } = payload;
        if (!clientSecret) {
          return res.status(400).json({ error: 'clientSecret is required for rotation' });
        }
        const result = await db.query(
          `UPDATE public.organization_sso_configs
           SET client_secret = pgp_sym_encrypt($2::text, $3::text),
               updated_by = $4, updated_at = timezone('utc', now())
           WHERE id = $1 AND organization_id = $5
           RETURNING id, organization_id, provider, client_id, tenant_id, domain_hint, redirect_uri, is_enabled,
             client_secret IS NOT NULL AS has_client_secret,
             CASE WHEN client_secret IS NOT NULL THEN '••••••••' ELSE NULL END AS client_secret_masked,
             created_by, updated_by, created_at, updated_at`,
          [id, clientSecret, ssoKey, auth.userId, auth.organizationId]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'SSO config not found' });
        }
        return res.status(200).json({ data: result.rows[0] });
      }

      case 'test': {
        const { id } = payload;
        const configResult = await db.query(
          `SELECT id, provider, client_id, tenant_id, domain_hint, redirect_uri, is_enabled,
                  client_secret IS NOT NULL AS has_client_secret
           FROM public.organization_sso_configs
           WHERE id = $1 AND organization_id = $2`,
          [id, auth.organizationId]
        );
        if (configResult.rows.length === 0) {
          return res.status(200).json({
            data: { success: false, message: 'SSO configuration not found.' },
          });
        }
        const config = configResult.rows[0];
        const errors: string[] = [];

        if (!config.client_id) errors.push('Client ID is missing');
        if (!config.has_client_secret) errors.push('Client secret is not set');
        if (!config.redirect_uri) errors.push('Redirect URI is missing');
        if (config.provider === 'microsoft' && !config.tenant_id)
          errors.push('Tenant ID is required for Microsoft Entra ID');

        if (errors.length > 0) {
          return res.status(200).json({
            data: {
              success: false,
              message: 'Configuration has issues that need to be resolved.',
              errors,
              config: {
                provider: config.provider,
                client_id: config.client_id,
                redirect_uri: config.redirect_uri,
                tenant_id: config.tenant_id,
                domain_hint: config.domain_hint,
                is_enabled: config.is_enabled,
              },
            },
          });
        }

        return res.status(200).json({
          data: {
            success: true,
            message: `${config.provider === 'google' ? 'Google Workspace' : 'Microsoft Entra ID'} configuration looks valid. All required fields are present.`,
            config: {
              provider: config.provider,
              client_id: config.client_id,
              redirect_uri: config.redirect_uri,
              tenant_id: config.tenant_id,
              domain_hint: config.domain_hint,
              is_enabled: config.is_enabled,
            },
          },
        });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  })
);
