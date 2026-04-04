# Apply Database Migrations

## Overview

Database schema is managed by the Node backend (`backend-node/`). On startup, the backend runs `ensureDatabaseSchema()` which creates all required tables using `CREATE TABLE IF NOT EXISTS`.

## Method 1: Docker (Recommended)

The Docker Compose stack automatically bootstraps the database:

```bash
docker compose up --build
```

Postgres bootstraps from `docker/postgres/init/001_backend_node_bootstrap.sql`, and the backend applies additional schema checks on startup.

## Method 2: Manual SQL

If running Postgres standalone, apply the bootstrap SQL manually:

```bash
psql -U postgres -d kourti_local -f docker/postgres/init/001_backend_node_bootstrap.sql
```

## Method 3: Backend Auto-Bootstrap

In development mode, the Node backend auto-creates tables on startup:

```bash
cd backend-node
DATABASE_URL="postgresql://kourti:kourti@localhost:5432/kourti_local" npm run dev
```

Set `RUN_BOOTSTRAP=1` in production if you need to run bootstrap there.

## Calendar Migrations

Calendar-related tables (shares, recurring events, invitations, reminders, webhooks, API keys, audit logs) are included in the bootstrap SQL:

1. `calendar_shares` - Team calendar sharing
2. `calendar_event_instances` - Recurring event instances
3. `event_invitations` - Meeting invitations/RSVP
4. `user_notification_preferences` - Notification settings
5. `reminder_templates` - Reminder templates
6. `reminder_queue` - Multi-channel reminder queue
7. `calendar_digest_logs` - Digest email tracking
8. `webhook_subscriptions` - Webhook configs
9. `webhook_deliveries` - Webhook delivery logs
10. `api_keys` - REST API authentication
11. `api_request_logs` - API request audit
12. `security_audit_logs` - Security events

## Verification

After applying migrations, verify tables exist:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

## Troubleshooting

**Error: "relation already exists"**

- Safe to ignore — uses `IF NOT EXISTS`

**Error: "permission denied"**

- Ensure you're using the correct database user with CREATE privileges

**Error: "function does not exist"**

- Run the full bootstrap script, not individual fragments
