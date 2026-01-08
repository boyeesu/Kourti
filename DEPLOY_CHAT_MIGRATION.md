# Deploy Chat System Migration

## Issue
There's a migration history mismatch between local and remote Supabase. The chat system migration needs to be applied.

## Solution: Apply Migration via Supabase Dashboard

### Option 1: SQL Editor (Recommended)

1. **Go to Supabase Dashboard**
   - Navigate to: https://app.supabase.com
   - Select your project

2. **Open SQL Editor**
   - Click on "SQL Editor" in the left sidebar
   - Click "New query"

3. **Copy and paste the migration SQL**
   - Open the file: `supabase/migrations/20250122000000_create_chat_system.sql`
   - Copy the entire contents
   - Paste into the SQL Editor

4. **Run the migration**
   - Click "Run" or press Ctrl+Enter
   - Verify it completes successfully

5. **Verify tables were created**
   - Go to "Table Editor" in the left sidebar
   - You should see:
     - `conversations`
     - `conversation_participants`
     - `messages`

### Option 2: Fix Migration History Then Push

If you want to use the CLI:

1. **Mark remote-only migrations as reverted** (one-time fix):
   ```powershell
   cd "c:\Users\Daniel.Esuga\Kouti Legal Main Repo\kouti-legal-hub-41"
   # Run the repair commands shown in the error output
   ```

2. **Then push the new migration**:
   ```powershell
   npx supabase db push
   ```

## Verify Migration

After applying, verify the tables exist:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('conversations', 'conversation_participants', 'messages');
```

You should see all three tables listed.

## Test the Chat System

1. Start your dev server: `npm run dev`
2. Log in as two different users in the same organization
3. Click "Live Chat" in the sidebar
4. Start a new conversation
5. Send messages and verify real-time delivery
