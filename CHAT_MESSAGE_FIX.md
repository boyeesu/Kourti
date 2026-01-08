# Chat Message Sending Fix

## Issues Fixed

1. **Error Handling**: Added toast notifications to show errors when message sending fails
2. **Better Logging**: Added console logs to help debug message sending issues
3. **Database Trigger**: Created a migration to automatically update conversation `updated_at` when messages are inserted
4. **Real-time Support**: Verified real-time subscriptions are properly configured

## Changes Made

### 1. ChatWindow Component (`src/components/chat/ChatWindow.tsx`)
- Added `useToast` hook for error notifications
- Added error handling with user-friendly error messages
- Messages are restored if sending fails

### 2. useChat Hook (`src/hooks/useChat.ts`)
- Improved error handling in `useSendMessage`
- Added detailed logging for debugging
- Better error messages

### 3. Database Migration (`supabase/migrations/20250123000000_improve_chat_system.sql`)
- Added trigger to automatically update conversation `updated_at` when messages are inserted
- This ensures conversations are properly sorted by last activity

## Setup Required

### 1. Run the Migration
```bash
# If using Supabase CLI locally
supabase migration up

# Or apply the migration through Supabase Dashboard
```

### 2. Enable Real-time for Messages Table
In Supabase Dashboard:
1. Go to Database → Replication
2. Find the `messages` table
3. Enable replication/publication for real-time updates

Or via SQL:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
```

### 3. Verify RLS Policies
The RLS policies should already be in place from the original migration. Verify:
- Users can send messages to conversations they're participants in
- Messages are properly filtered by organization

## How It Works

1. **Message Sending**: 
   - User types message and clicks send
   - `useSendMessage` hook inserts message into `messages` table
   - Database trigger updates conversation `updated_at`
   - Real-time subscription broadcasts new message to all participants

2. **Real-time Updates**:
   - `useMessages` hook subscribes to `messages:${conversationId}` channel
   - When a new message is inserted, all participants receive it instantly
   - UI updates automatically without page refresh

3. **Error Handling**:
   - If sending fails, error is caught and displayed via toast
   - Message is restored to input field
   - User can retry sending

## Testing

1. Open a conversation
2. Type a message and click send
3. Verify:
   - Message appears immediately
   - Message is saved to database
   - Real-time updates work (open in two browsers)
   - Error handling works (check console for errors)

## Troubleshooting

If messages still don't send:

1. **Check Browser Console**: Look for error messages
2. **Check Network Tab**: Verify the POST request to `messages` table
3. **Check RLS Policies**: Ensure user is a participant in the conversation
4. **Check Real-time**: Verify real-time is enabled for `messages` table
5. **Check Database**: Verify the migration ran successfully

## Notes

- No edge function is required - messages are inserted directly via Supabase client
- Real-time is handled by Supabase Realtime subscriptions
- Messages are automatically timestamped by database (`created_at` default)
- Conversation timestamps are updated automatically via trigger
