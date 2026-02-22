# Database Consolidation Recommendations

## Current Database Tables Inventory

### Core Tables (8)
1. **organizations** - Tenant organizations
2. **profiles** - User profiles linked to organizations
3. **clients** - Client entities
4. **cases** - Legal cases
5. **documents** - Documents/contracts (contracts table was merged here)
6. **calendar_events** - Calendar events
7. **settings** - Organization settings (key-value)
8. **dashboard_prefs** - User dashboard preferences

### Calendar System (4 tables)
9. **event_reminders** - Event reminders
10. **user_calendar_integrations** - Calendar sync integrations (Google/Microsoft)
11. **calendar_sync_logs** - Calendar sync operation logs

### Chat System (3 tables)
12. **conversations** - Chat conversations
13. **conversation_participants** - Conversation participants
14. **messages** - Chat messages

### Document System (4 tables)
15. **doc_templates** - Document templates
16. **document_analyses** - AI document analysis results
17. **best_practices** - Best practice clauses with embeddings
18. **contract_embeddings** - (Already dropped per migration)

### Case Management (2 tables)
19. **case_activities** - Tasks/activities for cases
20. **time_entries** - Billable time tracking

### Notifications (3 tables)
21. **notifications** - In-app notifications
22. **notification_preferences** - User notification preferences
23. **email_delivery_logs** - Email delivery tracking

### Billing/Subscriptions (3 tables)
24. **subscription_plans** - Available subscription plans
25. **organization_subscriptions** - Active subscriptions
26. **payment_history** - Payment records

### Other (2 tables)
27. **invoices** - Invoices (referenced in indexes)
28. **user_csrf_sessions** - CSRF token sessions

**TOTAL: 28 tables**

---

## Consolidation Recommendations

### 🔴 HIGH PRIORITY MERGES

#### 1. Merge `settings` and `dashboard_prefs` → `user_preferences`
**Rationale**: Both store user/organization preferences. `settings` is key-value, `dashboard_prefs` is structured. Merge into a single JSONB-based preferences table.

**New Structure:**
```sql
CREATE TABLE user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  preference_type text NOT NULL CHECK (preference_type IN ('user', 'org', 'dashboard')),
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, organization_id, preference_type)
);
```

**Migration:**
- Move `dashboard_prefs` columns into `preferences` JSONB
- Move `settings` key-value pairs into `preferences` JSONB
- Drop both tables

**Impact**: Reduces 2 tables → 1 table

---

#### 2. Merge `notification_preferences` into `user_preferences`
**Rationale**: Notification preferences are just another type of user preference. Should be in the same table.

**Action:**
- Add notification preferences to the `user_preferences` table as `preference_type = 'notifications'`
- Drop `notification_preferences` table

**Impact**: Reduces 1 table

---

#### 3. Merge `calendar_sync_logs` into `user_calendar_integrations` (as JSONB array)
**Rationale**: Sync logs are just metadata about integrations. Store recent logs as JSONB array in the integration record, archive old logs separately if needed.

**New Structure:**
```sql
ALTER TABLE user_calendar_integrations
  ADD COLUMN sync_logs jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN last_sync_status text,
  ADD COLUMN last_sync_error text;
```

**Migration:**
- Migrate recent sync logs (last 10-20) into `sync_logs` JSONB array
- Drop `calendar_sync_logs` table
- For historical logs, create a separate archive table if needed, or just drop them

**Impact**: Reduces 1 table (or makes it optional archive)

---

#### 4. Consider merging `event_reminders` into `calendar_events` (as JSONB array)
**Rationale**: Reminders are tightly coupled to events. Storing as JSONB array reduces joins and simplifies queries.

**New Structure:**
```sql
ALTER TABLE calendar_events
  ADD COLUMN reminders jsonb DEFAULT '[]'::jsonb;
```

**JSONB Structure:**
```json
[
  {
    "user_id": "uuid",
    "reminder_type": "before|at",
    "reminder_minutes": 15,
    "sent": false,
    "sent_at": null,
    "notification_method": "in_app|email|both"
  }
]
```

**Migration:**
- Convert existing `event_reminders` rows to JSONB array in `calendar_events`
- Drop `event_reminders` table

**Impact**: Reduces 1 table, simplifies queries

**Note**: If you need complex reminder queries (e.g., "all reminders due in next hour"), you might want to keep this separate. But for most use cases, JSONB is sufficient.

---

### 🟡 MEDIUM PRIORITY MERGES

#### 5. Merge `time_entries` into `case_activities` (as JSONB array)
**Rationale**: Time entries are always tied to a single activity. Store as array within the activity record.

**New Structure:**
```sql
ALTER TABLE case_activities
  ADD COLUMN time_entries jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN total_minutes integer DEFAULT 0;
```

**JSONB Structure:**
```json
[
  {
    "user_id": "uuid",
    "minutes": 120,
    "notes": "Research and drafting",
    "created_at": "2025-01-21T10:00:00Z"
  }
]
```

**Migration:**
- Convert existing `time_entries` to JSONB array
- Drop `time_entries` table

**Impact**: Reduces 1 table

**Note**: If you need complex time reporting across multiple activities, you might want to keep this separate. Consider your reporting needs.

---

#### 6. Consider merging `conversation_participants` into `conversations` (as JSONB array)
**Rationale**: Participants are always queried with the conversation. JSONB array reduces joins.

**New Structure:**
```sql
ALTER TABLE conversations
  ADD COLUMN participants jsonb DEFAULT '[]'::jsonb,
  DROP COLUMN type; -- Can be derived from participants.length
```

**JSONB Structure:**
```json
[
  {
    "user_id": "uuid",
    "joined_at": "2025-01-21T10:00:00Z",
    "last_read_at": "2025-01-21T11:00:00Z"
  }
]
```

**Migration:**
- Convert existing `conversation_participants` to JSONB array
- Drop `conversation_participants` table

**Impact**: Reduces 1 table

**Note**: If you frequently query "all conversations user X is in", you might want to keep this separate for indexing. But for most chat apps, JSONB is fine.

---

#### 7. Merge `document_analyses` into `documents` (as JSONB column)
**Rationale**: Analysis results are always tied to a single document. Store as JSONB array.

**New Structure:**
```sql
ALTER TABLE documents
  ADD COLUMN analyses jsonb DEFAULT '[]'::jsonb;
```

**JSONB Structure:**
```json
[
  {
    "analysis_type": "general",
    "content": "Analysis text...",
    "status": "completed",
    "created_by": "uuid",
    "created_at": "2025-01-21T10:00:00Z",
    "embedding": [0.1, 0.2, ...],
    "metadata": {}
  }
]
```

**Migration:**
- Convert existing `document_analyses` to JSONB array
- Drop `document_analyses` table

**Impact**: Reduces 1 table

**Note**: If you need to query analyses across documents (e.g., "all analyses by type"), keep it separate. But for document-centric queries, JSONB is better.

---

### 🟢 LOW PRIORITY / OPTIONAL

#### 8. Consider merging `email_delivery_logs` into `notifications` (as JSONB)
**Rationale**: Email logs are metadata about notifications. Store delivery status in the notification record.

**New Structure:**
```sql
ALTER TABLE notifications
  ADD COLUMN email_delivery jsonb;
```

**JSONB Structure:**
```json
{
  "status": "sent|delivered|failed",
  "sent_at": "2025-01-21T10:00:00Z",
  "delivered_at": "2025-01-21T10:05:00Z",
  "provider_message_id": "...",
  "retry_count": 0,
  "error": "..."
}
```

**Migration:**
- Migrate recent email logs into notifications
- Drop `email_delivery_logs` table (or keep as archive only)

**Impact**: Reduces 1 table

**Note**: If you need to query email delivery stats across all notifications, keep it separate. But for most use cases, JSONB is sufficient.

---

#### 9. Consider if `best_practices` should be merged into `doc_templates`
**Rationale**: Both are document-related templates. Could be unified with a `type` column.

**Option A - Keep Separate**: If best practices are fundamentally different (library vs templates)

**Option B - Merge**: 
```sql
ALTER TABLE doc_templates
  ADD COLUMN template_type text CHECK (template_type IN ('template', 'best_practice')),
  ADD COLUMN embedding vector(1536);
```

**Recommendation**: Keep separate unless you have < 50 best practices. They serve different purposes.

---

## Summary of Recommended Consolidations

### Immediate Actions (High Priority)
1. ✅ Merge `settings` + `dashboard_prefs` → `user_preferences`
2. ✅ Merge `notification_preferences` → `user_preferences`
3. ✅ Merge `calendar_sync_logs` → `user_calendar_integrations` (as JSONB)
4. ✅ Merge `event_reminders` → `calendar_events` (as JSONB)

**Reduction: 4 tables → 0 (merged into existing)**

### Medium Priority
5. ✅ Merge `time_entries` → `case_activities` (as JSONB)
6. ✅ Merge `conversation_participants` → `conversations` (as JSONB)
7. ✅ Merge `document_analyses` → `documents` (as JSONB)

**Reduction: 3 tables → 0 (merged into existing)**

### Optional
8. ⚠️ Merge `email_delivery_logs` → `notifications` (as JSONB) - Only if you don't need cross-notification email analytics

**Reduction: 1 table → 0 (merged into existing)**

---

## Final Table Count

**Before**: 28 tables
**After**: 20 tables (8 tables removed)

**Reduction: 28.6% fewer tables**

---

## Remaining Tables (20)

### Core (7)
1. organizations
2. profiles
3. clients
4. cases
5. documents
6. calendar_events (now includes reminders)
7. user_preferences (merged from settings, dashboard_prefs, notification_preferences)

### Calendar (2)
8. user_calendar_integrations (now includes sync logs)
9. ~~calendar_sync_logs~~ → merged
10. ~~event_reminders~~ → merged

### Chat (2)
11. conversations (now includes participants)
12. messages
13. ~~conversation_participants~~ → merged

### Documents (3)
14. doc_templates
15. best_practices
16. ~~document_analyses~~ → merged

### Cases (1)
17. case_activities (now includes time entries)
18. ~~time_entries~~ → merged

### Notifications (2)
19. notifications (now includes email delivery logs)
20. ~~notification_preferences~~ → merged
21. ~~email_delivery_logs~~ → merged (optional)

### Billing (3)
22. subscription_plans
23. organization_subscriptions
24. payment_history

### Other (2)
25. invoices
26. user_csrf_sessions

---

## Implementation Notes

### When to Use JSONB vs Separate Tables

**Use JSONB when:**
- Data is always accessed with the parent record
- No need for complex cross-record queries
- Data volume per parent is small (< 100 items)
- Schema is flexible/frequently changing

**Keep Separate when:**
- Need complex queries across all child records
- Need foreign key constraints
- Data volume is large (> 1000 items per parent)
- Need to index child record fields independently

### Migration Strategy

1. **Add JSONB columns** to parent tables
2. **Migrate data** from child tables to JSONB
3. **Update application code** to use new structure
4. **Test thoroughly**
5. **Drop child tables** after verification

### Performance Considerations

- **Index JSONB fields** if you query them: `CREATE INDEX ON table USING GIN (jsonb_column);`
- **Use JSONB operators** efficiently: `@>`, `?`, `?&`, `?|`
- **Consider materialized views** for complex JSONB queries if needed

---

## Questions to Consider

1. **Do you query reminders across all events?** If yes, keep `event_reminders` separate.
2. **Do you need time reporting across all activities?** If yes, keep `time_entries` separate.
3. **Do you query participants across all conversations?** If yes, keep `conversation_participants` separate.
4. **Do you need email delivery analytics?** If yes, keep `email_delivery_logs` separate.

Answer these to finalize which merges to proceed with.
