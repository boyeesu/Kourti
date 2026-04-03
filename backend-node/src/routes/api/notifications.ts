import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';

const uuidLikeSchema = z.string().regex(/^[0-9a-fA-F-]{36}$/);

const listNotificationsQuerySchema = z.object({
  userId: uuidLikeSchema.optional(),
  status: z.enum(['read', 'unread', 'archived', 'all']).optional(),
  type: z.string().trim().min(1).optional(),
  archived: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  search: z.string().trim().min(1).optional(),
});

const unreadCountQuerySchema = z.object({
  userId: uuidLikeSchema.optional(),
});

const createNotificationBodySchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().optional(),
  type: z
    .enum([
      'info',
      'success',
      'warning',
      'error',
      'case',
      'client',
      'contract',
      'calendar',
      'document',
    ])
    .default('info'),
  user_id: uuidLikeSchema.optional(),
});

const notificationParamsSchema = z.object({
  notificationId: uuidLikeSchema,
});

const updateNotificationBodySchema = z.object({
  status: z.enum(['read', 'unread', 'archived']).optional(),
});

const updatePreferencesBodySchema = z.object({
  email_enabled: z.boolean().optional(),
  email_frequency: z.enum(['immediate', 'daily', 'weekly', 'never']).optional(),
  in_app_enabled: z.boolean().optional(),
  case_notifications: z.boolean().optional(),
  client_notifications: z.boolean().optional(),
  document_notifications: z.boolean().optional(),
  contract_notifications: z.boolean().optional(),
  calendar_notifications: z.boolean().optional(),
  task_notifications: z.boolean().optional(),
  invoice_notifications: z.boolean().optional(),
  general_notifications: z.boolean().optional(),
});

const sendEmailBodySchema = z.object({
  type: z
    .enum([
      'task_assigned',
      'case_update',
      'document_shared',
      'calendar_reminder',
      'invoice_created',
      'general',
    ])
    .default('general'),
  recipientUserId: uuidLikeSchema,
  title: z.string().trim().min(1),
  message: z.string().trim().min(1),
  actionUrl: z.string().optional(),
  actionText: z.string().optional(),
});

export const notificationsRouter = Router();

notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { userId, status, type, archived, search } = listNotificationsQuerySchema.parse(
      req.query
    );

    const clauses: string[] = ['organization_id = $1'];
    const values: unknown[] = [auth.organizationId];

    if (userId) {
      values.push(userId);
      clauses.push(`user_id = $${values.length}`);
    }

    if (status && status !== 'all') {
      values.push(status);
      clauses.push(`status = $${values.length}`);
    }

    if (type) {
      values.push(type);
      clauses.push(`type = $${values.length}`);
    }

    if (archived !== undefined) {
      clauses.push(archived ? 'archived_at is not null' : 'archived_at is null');
    }

    if (search) {
      values.push(`%${search}%`);
      clauses.push(`(title ilike $${values.length} or description ilike $${values.length})`);
    }

    const result = await db.query(
      `
      select *
      from public.notifications
      where ${clauses.join(' and ')}
      order by created_at desc
      `,
      values
    );

    res.status(200).json(result.rows);
  })
);

notificationsRouter.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { userId } = unreadCountQuerySchema.parse(req.query);
    const targetUserId = userId || auth.userId;

    const result = await db.query(
      `
      select count(*)::int as count
      from public.notifications
      where organization_id = $1
        and user_id = $2
        and status = 'unread'
        and archived_at is null
      `,
      [auth.organizationId, targetUserId]
    );

    res.status(200).json({ count: result.rows[0]?.count || 0 });
  })
);

notificationsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = createNotificationBodySchema.parse(req.body);

    const result = await db.query(
      `
      insert into public.notifications (
        user_id,
        organization_id,
        title,
        description,
        type,
        status,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, 'unread', now(), now())
      returning *
      `,
      [
        body.user_id || auth.userId,
        auth.organizationId,
        body.title,
        body.description || null,
        body.type,
      ]
    );

    res.status(201).json(result.rows[0]);
  })
);

notificationsRouter.post(
  '/email',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = sendEmailBodySchema.parse(req.body);

    const recipientProfile = await db.query(
      `
      select user_id
      from public.profiles
      where user_id = $1
        and organization_id = $2
      limit 1
      `,
      [body.recipientUserId, auth.organizationId]
    );

    if (!recipientProfile.rows[0]) {
      throw new ApiError('Recipient not found', 404, 'NOT_FOUND');
    }

    res.status(202).json({
      accepted: true,
      provider: 'pending',
      message: 'Email dispatch is queued for provider integration',
    });
  })
);

notificationsRouter.patch(
  '/:notificationId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { notificationId } = notificationParamsSchema.parse(req.params);
    const { status } = updateNotificationBodySchema.parse(req.body);

    if (!status) {
      throw new ApiError('No update fields provided', 400, 'VALIDATION_ERROR');
    }

    const result = await db.query(
      `
      update public.notifications
      set
        status = $1,
        archived_at = case
          when $1 = 'archived' then coalesce(archived_at, now())
          when $1 in ('read', 'unread') then null
          else archived_at
        end,
        updated_at = now()
      where id = $2
        and organization_id = $3
      returning *
      `,
      [status, notificationId, auth.organizationId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Notification not found', 404, 'NOT_FOUND');
    }

    res.status(200).json(result.rows[0]);
  })
);

notificationsRouter.post(
  '/mark-all-read',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db.query(
      `
      update public.notifications
      set status = 'read', updated_at = now()
      where organization_id = $1
        and user_id = $2
        and status = 'unread'
        and archived_at is null
      `,
      [auth.organizationId, auth.userId]
    );

    res.status(200).json({ updated: result.rowCount || 0 });
  })
);

notificationsRouter.delete(
  '/:notificationId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { notificationId } = notificationParamsSchema.parse(req.params);

    const result = await db.query(
      `
      delete from public.notifications
      where id = $1
        and organization_id = $2
      returning id
      `,
      [notificationId, auth.organizationId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Notification not found', 404, 'NOT_FOUND');
    }

    res.status(204).send();
  })
);

notificationsRouter.get(
  '/preferences',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db.query(
      `
      select *
      from public.notification_preferences
      where user_id = $1
        and organization_id = $2
      limit 1
      `,
      [auth.userId, auth.organizationId]
    );

    res.status(200).json(result.rows[0] || null);
  })
);

notificationsRouter.put(
  '/preferences',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = updatePreferencesBodySchema.parse(req.body);

    const result = await db.query(
      `
      insert into public.notification_preferences (
        user_id,
        organization_id,
        email_enabled,
        email_frequency,
        in_app_enabled,
        case_notifications,
        client_notifications,
        document_notifications,
        contract_notifications,
        calendar_notifications,
        task_notifications,
        invoice_notifications,
        general_notifications,
        created_at,
        updated_at
      )
      values (
        $1,
        $2,
        coalesce($3, true),
        coalesce($4, 'immediate'),
        coalesce($5, true),
        coalesce($6, true),
        coalesce($7, true),
        coalesce($8, true),
        coalesce($9, true),
        coalesce($10, true),
        coalesce($11, true),
        coalesce($12, true),
        coalesce($13, true),
        now(),
        now()
      )
      on conflict (user_id, organization_id)
      do update set
        email_enabled = coalesce(excluded.email_enabled, public.notification_preferences.email_enabled),
        email_frequency = coalesce(excluded.email_frequency, public.notification_preferences.email_frequency),
        in_app_enabled = coalesce(excluded.in_app_enabled, public.notification_preferences.in_app_enabled),
        case_notifications = coalesce(excluded.case_notifications, public.notification_preferences.case_notifications),
        client_notifications = coalesce(excluded.client_notifications, public.notification_preferences.client_notifications),
        document_notifications = coalesce(excluded.document_notifications, public.notification_preferences.document_notifications),
        contract_notifications = coalesce(excluded.contract_notifications, public.notification_preferences.contract_notifications),
        calendar_notifications = coalesce(excluded.calendar_notifications, public.notification_preferences.calendar_notifications),
        task_notifications = coalesce(excluded.task_notifications, public.notification_preferences.task_notifications),
        invoice_notifications = coalesce(excluded.invoice_notifications, public.notification_preferences.invoice_notifications),
        general_notifications = coalesce(excluded.general_notifications, public.notification_preferences.general_notifications),
        updated_at = now()
      returning *
      `,
      [
        auth.userId,
        auth.organizationId,
        body.email_enabled,
        body.email_frequency,
        body.in_app_enabled,
        body.case_notifications,
        body.client_notifications,
        body.document_notifications,
        body.contract_notifications,
        body.calendar_notifications,
        body.task_notifications,
        body.invoice_notifications,
        body.general_notifications,
      ]
    );

    res.status(200).json(result.rows[0]);
  })
);
