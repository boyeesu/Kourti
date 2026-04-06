# Node Backend Migration - Complete

## Status: ✅ MIGRATION COMPLETE

All business logic has been migrated from Supabase Edge Functions to the dedicated Node.js backend (`backend-node/`).

## Architecture

- **Backend**: Node.js + Express (`backend-node/`)
- **Database**: PostgreSQL (direct connection via `pg`)
- **Auth**: Custom JWT (access + refresh tokens)
- **AI**: OpenAI API via Node backend
- **Email**: Resend (branded templates with Kourti logo, gradient accents, and brand colours)
- **Job Queue**: pg-boss (PostgreSQL-backed) — monitors, weekly digest, async AI tasks
- **File Storage**: Local filesystem or S3-compatible

## Migrated Endpoints

All API endpoints are served by the Node backend at `/api/v1/`:

- `/api/v1/auth/*` - Authentication (sign-in, sign-up, refresh, password reset)
- `/api/v1/cases/*` - Case management CRUD
- `/api/v1/contracts/*` - Contract management CRUD
- `/api/v1/documents/*` - Document handling CRUD
- `/api/v1/clients/*` - Client management CRUD
- `/api/v1/ai/*` - AI-powered analysis (contract analysis, comparison, document extraction, Ream AI assistant)
- `/api/v1/chat/*` - Real-time chat/conversations
- `/api/v1/files/*` - File upload/download with signed URLs
- `/api/v1/users/*` - User management and invitations
- `/api/v1/organizations/*` - Organization management
- `/api/v1/calendar/*` - Calendar events
- `/api/v1/invoices/*` - Invoice handling
- `/api/v1/dashboard/*` - Dashboard data
- `/api/v1/search/*` - Global search
- `/api/v1/notifications/*` - Notification management, weekly digest trigger & preview
- `/api/v1/admin/*` - Admin operations
- `/api/v1/roles/*` - Role management
- `/api/v1/tasks/*` - Task management

## Security Baseline

- JWT verification with custom signing keys
- RBAC authorization via role assignments
- Rate limiting with clear headers
- Helmet security headers
- Request-scoped logging with request IDs
- Zod input validation
- Centralized error handling

## Frontend Configuration

```bash
VITE_USE_NODE_BACKEND=true
VITE_BACKEND_API_URL=http://localhost:4000
```

## Deployment

- **Backend**: Railway (or any Node.js host)
- **Frontend**: Vercel
- **Database**: Any PostgreSQL provider
- **Docker**: Full stack via `docker-compose.yml`
