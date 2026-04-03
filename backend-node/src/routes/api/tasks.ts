import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';

const listTasksQuerySchema = z.object({
  caseId: z.string().uuid(),
});

const createTaskBodySchema = z.object({
  case_id: z.string().uuid(),
  title: z.string().trim().min(1),
  description: z.string().optional(),
  due_date: z.string().optional(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  assigned_to: z.string().uuid().optional(),
  task_type: z.string().optional(),
});

const updateTaskParamsSchema = z.object({
  taskId: z.string().uuid(),
});

const updateTaskBodySchema = createTaskBodySchema.partial().extend({
  completed: z.boolean().optional(),
});

export const tasksRouter = Router();

tasksRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { caseId } = listTasksQuerySchema.parse(req.query);

    const result = await db.query(
      `
      select t.*
      from public.tasks t
      join public.cases c on c.id = t.case_id
      where t.case_id = $1
        and c.organization_id = $2
      order by t.due_date asc nulls last, t.created_at desc
      `,
      [caseId, auth.organizationId]
    );

    res.status(200).json(result.rows);
  })
);

tasksRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = createTaskBodySchema.parse(req.body);

    const caseCheck = await db.query(
      'select id from public.cases where id = $1 and organization_id = $2 limit 1',
      [body.case_id, auth.organizationId]
    );

    if (!caseCheck.rows[0]) {
      throw new ApiError('Case not found', 404, 'NOT_FOUND');
    }

    const result = await db.query(
      `
      insert into public.tasks (
        case_id,
        title,
        description,
        due_date,
        priority,
        assigned_to,
        task_type,
        created_by,
        completed,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, false, now())
      returning *
      `,
      [
        body.case_id,
        body.title,
        body.description || null,
        body.due_date || null,
        body.priority || null,
        body.assigned_to || null,
        body.task_type || null,
        auth.userId,
      ]
    );

    res.status(201).json(result.rows[0]);
  })
);

tasksRouter.patch(
  '/:taskId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { taskId } = updateTaskParamsSchema.parse(req.params);
    const body = updateTaskBodySchema.parse(req.body);

    const ownership = await db.query(
      `
      select t.id
      from public.tasks t
      join public.cases c on c.id = t.case_id
      where t.id = $1 and c.organization_id = $2
      limit 1
      `,
      [taskId, auth.organizationId]
    );

    if (!ownership.rows[0]) {
      throw new ApiError('Task not found', 404, 'NOT_FOUND');
    }

    const updates: Array<{ column: string; value: unknown }> = [
      { column: 'title', value: body.title },
      { column: 'description', value: body.description },
      { column: 'due_date', value: body.due_date },
      { column: 'priority', value: body.priority },
      { column: 'assigned_to', value: body.assigned_to },
      { column: 'task_type', value: body.task_type },
      { column: 'completed', value: body.completed },
    ].filter((entry) => entry.value !== undefined);

    if (!updates.length) {
      throw new ApiError('No update fields provided', 400, 'VALIDATION_ERROR');
    }

    const setClause = updates.map((entry, index) => `${entry.column} = $${index + 1}`).join(', ');
    const values = updates.map((entry) => entry.value);

    const result = await db.query(
      `
      update public.tasks
      set ${setClause}, updated_at = now()
      where id = $${updates.length + 1}
      returning *
      `,
      [...values, taskId]
    );

    res.status(200).json(result.rows[0]);
  })
);

tasksRouter.delete(
  '/:taskId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { taskId } = updateTaskParamsSchema.parse(req.params);

    const result = await db.query(
      `
      delete from public.tasks t
      using public.cases c
      where t.case_id = c.id
        and t.id = $1
        and c.organization_id = $2
      returning t.id
      `,
      [taskId, auth.organizationId]
    );

    if ((result.rowCount || 0) === 0) {
      throw new ApiError('Task not found', 404, 'NOT_FOUND');
    }

    res.status(204).send();
  })
);
