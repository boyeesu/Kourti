# backend-node

Initial Node backend scaffold for the Supabase-to-Node migration.

## Run locally

1. Install deps: `npm install`
2. Start dev server: `npm run dev`
3. Health check: `GET http://localhost:4000/health`

## Required environment variables

- `DATABASE_URL` (Postgres connection string)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `PORT` (default `4000`)
- `CORS_ORIGINS` (comma-separated)
- `OPENAI_API_KEY`
- `OPENAI_CHAT_MODEL`
- `OPENAI_FALLBACK_CHAT_MODEL`
- `AUTH_MODE` (`supabase` or `development`)
- `DEV_DEFAULT_USER_ID`
- `DEV_DEFAULT_ORG_ID`

Note:

- Document file signing/preview/download endpoints (`/api/v1/documents/:id/signed-url`) require
  `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` even when `AUTH_MODE=development`.

## Scope of this scaffold

- Express app bootstrap
- Security middleware (`helmet`, `cors`)
- Request ID + centralized error handling
- Auth middleware (Supabase bearer token verification)
- Postgres-backed migration routes:
  - `GET /api/v1/contracts`
  - `GET /api/v1/cases`
  - `GET /api/v1/documents`
  - `GET /api/v1/search/global`
  - `GET /api/v1/documents/:id/signed-url`
  - `POST /api/v1/ai/ream-assistant`
  - `POST /api/v1/ai/advanced-contract-analysis`
  - `POST /api/v1/ai/extract-document-text`
  - `POST /api/v1/ai/rag/search`
  - `POST /api/v1/ai/rag/process-document`
  - `GET/POST/PATCH/DELETE /api/v1/ai/conversations`
  - `GET/POST/DELETE /api/v1/ai/conversations/:conversationId/messages`
  - `GET/POST /api/v1/chat/...` (conversations, messages, read, signed-url)

## Docker

- Backend Dockerfile: `backend-node/Dockerfile`
- Full local stack (frontend + backend + postgres): `docker-compose.yml`
- Setup guide: `docs/docker-local-setup.md`
