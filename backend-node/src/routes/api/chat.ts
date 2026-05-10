import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { createSignedUrl } from '../../services/storage.js';

const conversationIdParamsSchema = z.object({
  conversationId: z.string().uuid(),
});

const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(10000),
  replyToId: z.string().uuid().nullable().optional(),
});

const sendFileMessageSchema = z.object({
  fileName: z.string().trim().min(1),
  fileSize: z.number().int().nonnegative(),
  fileType: z.string().trim().min(1),
  filePath: z.string().trim().min(1),
});

const createDirectConversationSchema = z.object({
  otherUserId: z.string().uuid(),
});

const chatSignedUrlSchema = z.object({
  filePath: z.string().trim().min(1),
  expiresIn: z.coerce.number().int().min(30).max(3600).default(300),
  disposition: z.enum(['inline', 'attachment']).default('inline'),
  filename: z.string().trim().min(1).max(255).optional(),
});

async function ensureConversationParticipant(
  conversationId: string,
  userId: string,
  organizationId: string
) {
  const result = await db.query<{ id: string }>(
    `
    select c.id
    from public.conversations c
    join public.conversation_participants cp on cp.conversation_id = c.id
    where c.id = $1
      and c.organization_id = $2
      and cp.user_id = $3
    limit 1
    `,
    [conversationId, organizationId, userId]
  );

  if (!result.rows[0]) {
    throw new ApiError('Conversation not found', 404, 'NOT_FOUND');
  }
}

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: 'text' | 'file' | 'system';
  metadata: Record<string, unknown> | null;
  reply_to_id: string | null;
  created_at: string;
  updated_at: string;
  sender_first_name: string | null;
  sender_last_name: string | null;
  sender_email: string | null;
};

function mapMessageRow(row: MessageRow) {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    content: row.content,
    message_type: row.message_type,
    metadata: row.metadata || undefined,
    reply_to_id: row.reply_to_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    sender: {
      id: row.sender_id,
      first_name: row.sender_first_name,
      last_name: row.sender_last_name,
      email: row.sender_email,
    },
  };
}

export const chatRouter = Router();

chatRouter.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const conversationsResult = await db.query<{
      id: string;
      organization_id: string;
      type: 'direct' | 'group';
      name: string | null;
      created_by: string;
      created_at: string;
      updated_at: string;
      last_read_at: string | null;
    }>(
      `
      select
        c.id,
        c.organization_id,
        c.type,
        c.name,
        c.created_by,
        c.created_at,
        c.updated_at,
        cp.last_read_at
      from public.conversations c
      join public.conversation_participants cp
        on cp.conversation_id = c.id
      where c.organization_id = $1
        and cp.user_id = $2
      order by c.updated_at desc
      `,
      [auth.organizationId, auth.userId]
    );

    if (!conversationsResult.rows.length) {
      res.status(200).json([]);
      return;
    }

    const conversationIds = conversationsResult.rows.map((row) => row.id);

    const participantsResult = await db.query<{
      conversation_id: string;
      user_id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    }>(
      `
      select
        cp.conversation_id,
        cp.user_id,
        p.first_name,
        p.last_name,
        p.email
      from public.conversation_participants cp
      left join public.profiles p on p.user_id = cp.user_id
      where cp.conversation_id = any($1::uuid[])
      `,
      [conversationIds]
    );

    const lastMessageResult = await db.query<MessageRow>(
      `
      select distinct on (m.conversation_id)
        m.id,
        m.conversation_id,
        m.sender_id,
        m.content,
        m.message_type,
        m.metadata,
        m.reply_to_id,
        m.created_at,
        m.updated_at,
        p.first_name as sender_first_name,
        p.last_name as sender_last_name,
        p.email as sender_email
      from public.messages m
      left join public.profiles p on p.user_id = m.sender_id
      where m.conversation_id = any($1::uuid[])
      order by m.conversation_id, m.created_at desc
      `,
      [conversationIds]
    );

    const unreadResult = await db.query<{
      conversation_id: string;
      unread_count: number;
    }>(
      `
      select
        c.id as conversation_id,
        count(m.id)::int as unread_count
      from public.conversations c
      join public.conversation_participants cp
        on cp.conversation_id = c.id
      left join public.messages m
        on m.conversation_id = c.id
        and m.sender_id <> $2
        and m.created_at > coalesce(cp.last_read_at, '1970-01-01'::timestamptz)
      where c.id = any($1::uuid[])
        and cp.user_id = $2
      group by c.id
      `,
      [conversationIds, auth.userId]
    );

    const participantsMap = new Map<string, Array<Record<string, unknown>>>();
    participantsResult.rows.forEach((row) => {
      const existing = participantsMap.get(row.conversation_id) || [];
      existing.push({
        user_id: row.user_id,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
      });
      participantsMap.set(row.conversation_id, existing);
    });

    const lastMessageMap = new Map(lastMessageResult.rows.map((row) => [row.conversation_id, row]));
    const unreadMap = new Map(
      unreadResult.rows.map((row) => [row.conversation_id, row.unread_count])
    );

    const conversations = conversationsResult.rows.map((row) => ({
      id: row.id,
      organization_id: row.organization_id,
      type: row.type,
      name: row.name,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      participants: participantsMap.get(row.id) || [],
      last_message: lastMessageMap.get(row.id) ? mapMessageRow(lastMessageMap.get(row.id)!) : null,
      unread_count: unreadMap.get(row.id) || 0,
    }));

    res.status(200).json(conversations);
  })
);

chatRouter.get(
  '/conversations/:conversationId/messages',
  asyncHandler(async (req, res) => {
    const { conversationId } = conversationIdParamsSchema.parse(req.params);
    const auth = req.auth!;
    await ensureConversationParticipant(conversationId, auth.userId, auth.organizationId);

    const result = await db.query<MessageRow>(
      `
      select
        m.id,
        m.conversation_id,
        m.sender_id,
        m.content,
        m.message_type,
        m.metadata,
        m.reply_to_id,
        m.created_at,
        m.updated_at,
        p.first_name as sender_first_name,
        p.last_name as sender_last_name,
        p.email as sender_email
      from public.messages m
      left join public.profiles p on p.user_id = m.sender_id
      where m.conversation_id = $1
      order by m.created_at asc
      `,
      [conversationId]
    );

    const mapped = result.rows.map(mapMessageRow);
    const map = new Map(mapped.map((msg) => [msg.id, msg]));

    const withReplies = mapped.map((msg) => ({
      ...msg,
      reply_to: msg.reply_to_id ? map.get(msg.reply_to_id) || null : null,
    }));

    res.status(200).json(withReplies);
  })
);

chatRouter.post(
  '/conversations/:conversationId/messages',
  asyncHandler(async (req, res) => {
    const { conversationId } = conversationIdParamsSchema.parse(req.params);
    const parsed = sendMessageSchema.parse(req.body);
    const auth = req.auth!;
    await ensureConversationParticipant(conversationId, auth.userId, auth.organizationId);

    const client = await db.connect();
    try {
      await client.query('begin');

      const result = await client.query<MessageRow>(
        `
        insert into public.messages (
          conversation_id,
          sender_id,
          content,
          message_type,
          reply_to_id
        )
        values ($1, $2, $3, 'text', $4)
        returning
          id,
          conversation_id,
          sender_id,
          content,
          message_type,
          metadata,
          reply_to_id,
          created_at,
          updated_at,
          null::text as sender_first_name,
          null::text as sender_last_name,
          null::text as sender_email
        `,
        [conversationId, auth.userId, parsed.content, parsed.replyToId || null]
      );

      await client.query('update public.conversations set updated_at = now() where id = $1', [
        conversationId,
      ]);

      await client.query('commit');
      res.status(201).json(mapMessageRow(result.rows[0]));
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  })
);

chatRouter.post(
  '/conversations/:conversationId/messages/file',
  asyncHandler(async (req, res) => {
    const { conversationId } = conversationIdParamsSchema.parse(req.params);
    const parsed = sendFileMessageSchema.parse(req.body);
    const auth = req.auth!;

    await ensureConversationParticipant(conversationId, auth.userId, auth.organizationId);

    if (!parsed.filePath.startsWith(`${auth.organizationId}/`)) {
      throw new ApiError('Invalid file path for organization', 403, 'FORBIDDEN_FILE_PATH');
    }

    const client = await db.connect();
    try {
      await client.query('begin');

      const result = await client.query<MessageRow>(
        `
        insert into public.messages (
          conversation_id,
          sender_id,
          content,
          message_type,
          metadata
        )
        values ($1, $2, $3, 'file', $4::jsonb)
        returning
          id,
          conversation_id,
          sender_id,
          content,
          message_type,
          metadata,
          reply_to_id,
          created_at,
          updated_at,
          null::text as sender_first_name,
          null::text as sender_last_name,
          null::text as sender_email
        `,
        [
          conversationId,
          auth.userId,
          parsed.fileName,
          JSON.stringify({
            file_name: parsed.fileName,
            file_size: parsed.fileSize,
            file_type: parsed.fileType,
            file_path: parsed.filePath,
          }),
        ]
      );

      await client.query('update public.conversations set updated_at = now() where id = $1', [
        conversationId,
      ]);

      await client.query('commit');
      res.status(201).json(mapMessageRow(result.rows[0]));
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  })
);

chatRouter.post(
  '/conversations/direct',
  asyncHandler(async (req, res) => {
    const { otherUserId } = createDirectConversationSchema.parse(req.body);
    const auth = req.auth!;

    if (otherUserId === auth.userId) {
      throw new ApiError('Cannot create direct conversation with self', 400, 'VALIDATION_ERROR');
    }

    const existing = await db.query<{ id: string }>(
      `
      select c.id
      from public.conversations c
      join public.conversation_participants cp1
        on cp1.conversation_id = c.id and cp1.user_id = $1
      join public.conversation_participants cp2
        on cp2.conversation_id = c.id and cp2.user_id = $2
      where c.type = 'direct'
        and c.organization_id = $3
      limit 1
      `,
      [auth.userId, otherUserId, auth.organizationId]
    );

    if (existing.rows[0]) {
      res.status(200).json({ conversationId: existing.rows[0].id });
      return;
    }

    const client = await db.connect();
    try {
      await client.query('begin');

      const created = await client.query<{ id: string }>(
        `
        insert into public.conversations (organization_id, type, name, created_by)
        values ($1, 'direct', null, $2)
        returning id
        `,
        [auth.organizationId, auth.userId]
      );

      const conversationId = created.rows[0].id;

      await client.query(
        `
        insert into public.conversation_participants (conversation_id, user_id)
        values ($1, $2), ($1, $3)
        on conflict do nothing
        `,
        [conversationId, auth.userId, otherUserId]
      );

      await client.query('commit');
      res.status(201).json({ conversationId });
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  })
);

chatRouter.post(
  '/conversations/:conversationId/read',
  asyncHandler(async (req, res) => {
    const { conversationId } = conversationIdParamsSchema.parse(req.params);
    const auth = req.auth!;

    await ensureConversationParticipant(conversationId, auth.userId, auth.organizationId);

    await db.query(
      `
      update public.conversation_participants
      set last_read_at = now()
      where conversation_id = $1
        and user_id = $2
      `,
      [conversationId, auth.userId]
    );

    res.status(204).send();
  })
);

chatRouter.get(
  '/files/signed-url',
  asyncHandler(async (req, res) => {
    const parsed = chatSignedUrlSchema.parse(req.query);
    const auth = req.auth!;

    if (!parsed.filePath.startsWith(`${auth.organizationId}/`)) {
      throw new ApiError('Invalid file path for organization', 403, 'FORBIDDEN_FILE_PATH');
    }

    const safeFilename = (parsed.filename || 'download').replace(/[\r\n/\\]+/g, '_');

    const signedUrl = createSignedUrl(
      'Chat_Storage',
      parsed.filePath,
      parsed.expiresIn,
      auth.organizationId
    );

    res.status(200).json({
      signedUrl,
      expiresIn: parsed.expiresIn,
      expiresAt: new Date(Date.now() + parsed.expiresIn * 1000).toISOString(),
      fileName: safeFilename,
      disposition: parsed.disposition,
    });
  })
);
