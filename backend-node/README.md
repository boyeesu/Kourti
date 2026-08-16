# backend-node

Node/Express API for Kourti Legal.

## Run locally

1. Install deps: `npm install`
2. Start dev server: `npm run dev`
3. Health check: `GET http://localhost:4000/health`

## Required environment variables

- `DATABASE_URL` (Postgres connection string)

Optional:

- `PORT` (default `4000`)
- `CORS_ORIGINS` (comma-separated)
- `OPENAI_API_KEY`
- `OPENAI_CHAT_MODEL`
- `OPENAI_FALLBACK_CHAT_MODEL`
- `AUTH_MODE` (`custom` or `development`)
- `DEV_DEFAULT_USER_ID`
- `DEV_DEFAULT_ORG_ID`
- `RESEND_API_KEY` (required for email delivery)
- `SMTP_FROM_EMAIL` (default `noreply@kourti.com`)
- `APP_URL` (used for email links and logo)

Note:

- See [`.env.example`](.env.example) and
  [`../docs/ENVIRONMENT.md`](../docs/ENVIRONMENT.md) for the complete and
  current configuration reference. Storage is configured with local filesystem
  or S3/R2-compatible settings; no Supabase credentials are required.

## Email System

All transactional emails use **Resend** with Kourti-branded templates (logo, gradient accent bar, brand colours).

### Templates

| Template          | Function                   | Trigger                        |
| ----------------- | -------------------------- | ------------------------------ |
| Welcome           | `sendWelcomeEmail()`       | User sign-up                   |
| Password Reset    | `sendPasswordResetEmail()` | Forgot password                |
| Invitation        | `sendInvitationEmail()`    | Team invite                    |
| Notification      | `sendNotificationEmail()`  | In-app events                  |
| **Weekly Digest** | `sendWeeklyDigestEmail()`  | pg-boss cron (Monday 8 AM UTC) |

### Weekly Insights Digest

A scheduled email sent every Monday to users with `email_frequency = 'weekly'` in their notification preferences. The digest includes:

- **Cases** — active count, new & closed this week
- **Tasks** — completed, pending, overdue, completion rate
- **Clients & Documents** — totals and weekly changes
- **Contracts** — active count, expiring within 30 days
- **Revenue** — invoices paid this week, overdue count

**Architecture:**

- Scheduler: `src/agents/weeklyDigest.ts` registers two pg-boss handlers
  - `weekly_digest_scheduler` — cron `0 8 * * 1`, finds opted-in users and queues individual jobs
  - `weekly_digest_send` — gathers metrics via 11 parallel SQL queries and sends the email
- API: `POST /api/v1/notifications/weekly-digest` — manually trigger your own digest
- Preview: `GET /api/v1/notifications/weekly-digest/preview` — returns raw metrics JSON

**Manual trigger script:**

```sh
cd backend-node
DATABASE_URL="..." RESEND_API_KEY="..." node scripts/trigger-digest.mjs
```

## Background Jobs (pg-boss)

The backend uses **pg-boss** (PostgreSQL-backed job queue) for scheduled and async work.

| Job                       | Schedule        | Description                                                            |
| ------------------------- | --------------- | ---------------------------------------------------------------------- |
| `monitor_scheduler`       | Every 5 min     | Checks for due monitors (contract expiry, case deadlines, doc changes) |
| `monitor_run`             | On demand       | Executes a single monitor                                              |
| `weekly_digest_scheduler` | Monday 8 AM UTC | Queues weekly digest emails for opted-in users                         |
| `weekly_digest_send`      | On demand       | Gathers metrics and sends one digest email                             |
| `matter_review`           | On demand       | AI-powered matter review                                               |
| `intelligence_synthesis`  | On demand       | AI intelligence synthesis                                              |

## Docker

- Backend Dockerfile: `backend-node/Dockerfile`
- Full local stack (frontend + backend + postgres): `docker-compose.yml`
- Setup guide: `docs/docker-local-setup.md`
