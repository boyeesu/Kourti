# Docker Local Setup (Frontend + Node API + Postgres)

This stack runs the full local architecture:

- Frontend (`app`) on `http://localhost:8080`
- Node backend (`backend`) on `http://localhost:4000`
- Local Postgres (`postgres`) on `localhost:5432`

## 1) Configure environment

Use `.env` (or shell exports) with at least:

```bash
VITE_USE_NODE_BACKEND=true
VITE_BACKEND_API_URL=http://localhost:4000
```

Optional for Node AI route:

```bash
OPENAI_API_KEY=<your-openai-key>
```

For local backend-only auth bypass (no JWT token checks):

```bash
AUTH_MODE=development
DEV_DEFAULT_USER_ID=00000000-0000-0000-0000-000000000001
DEV_DEFAULT_ORG_ID=00000000-0000-0000-0000-000000000001
```

## 2) Start stack

```bash
docker compose up --build
```

## 3) Verify services

- Frontend: `http://localhost:8080`
- Backend health: `http://localhost:4000/health`
- Postgres readiness:
  - `docker compose exec postgres pg_isready`

## 4) Notes

- Postgres bootstraps minimal schema from `docker/postgres/init/001_backend_node_bootstrap.sql`.
- Backend also applies safe `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... IF NOT EXISTS` checks on startup for local schema parity.
- Data persists in the `postgres-data` Docker volume.
- For production, switch `AUTH_MODE` to `custom` and set `JWT_SECRET` and `JWT_REFRESH_SECRET`.
