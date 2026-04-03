# Node Backend Migration Plan

## Goals

- Move business logic from Supabase Edge Functions to a dedicated Node backend incrementally.
- Keep Supabase Auth and Postgres in place during transition to avoid risky big-bang rewrites.
- Introduce one API gateway (`backend-node`) with explicit ownership for auth, rate limiting, and observability.

## Phased rollout

1. **Foundation**
   - Stand up `backend-node` with health checks, request IDs, structured errors, and shared middleware.
   - Add environment contracts and deployment pipeline for staging.

2. **Dual-run AI endpoints (highest cost first)**
   - Mirror `advanced-contract-analysis` in Node and route a small percentage of traffic.
   - Keep Supabase function as fallback until parity in latency, quality, and error rates is verified.

3. **Core domain APIs**
   - Introduce `/api/contracts`, `/api/documents`, and `/api/cases` read endpoints.
   - Migrate write paths after RBAC and audit logging parity checks pass.

4. **Deprecate Supabase function surface**
   - Freeze new edge-function additions.
   - Remove or proxy legacy functions once equivalent Node routes are stable.

## Security baseline for Node API

- JWT verification against Supabase Auth JWKs.
- CSRF protection for browser-originating state-changing requests.
- Distributed-first rate limiting with clear headers and retry semantics.
- Request-scoped logging with redaction rules for sensitive fields.

## Data and compatibility strategy

- Keep current Postgres schema and RLS policies active until Node authorization checks are production-proven.
- Use contract tests against existing edge-function payloads to preserve frontend compatibility.
- Add feature flags so frontend can switch endpoint by capability (not by release branch).

## Immediate next steps

1. Implement Node server bootstrap and health endpoint (scaffold added).
2. Add authenticated `POST /api/ai/advanced-contract-analysis` route with the same payload contract.
3. Add parity tests comparing Node response envelope vs current edge function response envelope.
4. Deploy staging and run shadow traffic before enabling production routing.

## Progress snapshot

- `backend-node` now includes authenticated routes for contracts, cases, documents, global search, and advanced contract analysis.
- Contracts and cases now support CRUD + single-item fetch in Node API (`/api/v1/contracts`, `/api/v1/cases`).
- Documents now support CRUD + single-item fetch + signed URL generation in Node API (`/api/v1/documents`).
- RAG search and processing now have Node endpoints (`/api/v1/ai/rag/search`, `/api/v1/ai/rag/process-document`) and frontend routing support.
- Ream AI assistant now has a Node endpoint (`/api/v1/ai/ream-assistant`) and frontend routing support.
- AI conversations/messages now have Node CRUD endpoints and frontend hook routing support.
- Chat conversations/messages/read + file signed-url now have Node endpoints and frontend hook routing support.
- Frontend feature flags now allow migrated reads to run through Node:
  - `VITE_USE_NODE_BACKEND=true`
  - `VITE_BACKEND_API_URL=<node-api-base-url>`
- Frontend hooks now route contracts/cases reads and mutations to Node when flag is enabled.
- Frontend document hooks/context/viewers now use Node API paths when enabled.
- Local backend startup auto-bootstraps required schema for dockerized Postgres development.
- Supabase remains available as fallback while parity validation is ongoing.
