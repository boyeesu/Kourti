# Live Chat System - Custom Implementation

## Overview

A fully integrated peer-to-peer chat system built with Supabase Realtime, enabling real-time communication between organization members.

## Features

- **Real-time Messaging**: Instant message delivery using Supabase Realtime subscriptions
- **Direct Conversations**: One-on-one chats between organization members
- **Group Conversations**: Support for group chats (future enhancement)
- **Unread Counts**: Track unread messages per conversation
- **Message History**: Persistent message storage with full history
- **User Identification**: Automatic user profile integration
- **Organization Scoped**: Only members of the same organization can chat

## Architecture

### Database Schema

- **conversations**: Stores chat conversations (direct or group)
- **conversation_participants**: Tracks who is in each conversation
- **messages**: Stores all chat messages with sender information

### Components

- **LiveChat**: Main chat container (modal overlay)
- **ChatSidebar**: List of conversations with search
- **ChatWindow**: Active conversation view with message input
- **NewChatDialog**: Dialog to start new conversations

### Hooks

- **useConversations**: Fetches user's conversations
- **useMessages**: Fetches messages with realtime updates
- **useSendMessage**: Sends new messages
- **useGetOrCreateDirectConversation**: Creates or retrieves direct conversations
- **useMarkAsRead**: Marks messages as read

## Usage

1. Click "Live Chat" in the sidebar (prominent button at bottom)
2. Select an existing conversation or click "+" to start a new one
3. Type and send messages in real-time
4. Messages are delivered instantly to other participants

## Database Migration

Run the migration to create the chat tables:

```bash
supabase migration up
```

Or deploy all migrations:

```bash
npm run supabase:deploy:all
```

## Security

- Row Level Security (RLS) policies ensure users can only:
  - View conversations in their organization
  - See messages in conversations they're part of
  - Send messages only to their conversations
- All queries are scoped by organization_id

## Real-time Updates

Messages are delivered in real-time using Supabase Realtime subscriptions. When a new message is inserted, all participants receive it instantly without page refresh.

## Future Enhancements

- Group chat creation UI
- File attachments
- Message reactions
- Typing indicators
- Read receipts
- Message search
- Notifications for new messages
