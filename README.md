# Kourti Legal

Kourti Legal is a self-hostable legal operations platform for managing matters,
clients, documents, contracts, workflows, and AI-assisted review.

> **Important:** Kourti Legal is software, not legal advice. AI-generated
> content can be inaccurate and must be reviewed by a qualified professional
> before it is relied upon or shared.

## Features

- Matter, client, document, contract, task, calendar, invoice, and client-portal workflows.
- Role-based access controls, audit-oriented administration, notifications, and team management.
- AI-assisted drafting, review, comparison, risk extraction, and legal-workflow automation.
- PostgreSQL-backed Node/Express API, React/Vite frontend, and Docker Compose local stack.
- Optional integrations for AI providers, Resend email, S3-compatible storage, ClamAV, SSO, and Paystack.

## Quick start

### With Docker (recommended)

```sh
git clone https://github.com/boyeesu/Kourti.git
cd Kourti
cp .env.example .env
cp backend-node/.env.example backend-node/.env
docker compose up --build
```

Open `http://localhost:8080`. The API health endpoint is available at
`http://localhost:4000/health`.

The supplied development defaults are for a local machine only. Before any
public deployment, use `AUTH_MODE=custom`, strong distinct JWT secrets, TLS,
restricted CORS origins, a production database, and persistent object storage.

See [Docker setup](docs/docker-local-setup.md), [environment reference](docs/ENVIRONMENT.md),
and [database bootstrap](APPLY_MIGRATIONS.md) for complete setup details.

### Without Docker

Requirements: Node.js 22+, npm, and PostgreSQL 16+.

```sh
# frontend
npm ci
npm run dev

# in another terminal: backend
cd backend-node
cp .env.example .env
npm ci
npm run dev
```

Set `DATABASE_URL` in `backend-node/.env` to a local PostgreSQL instance. The
backend bootstraps its schema in development; see [APPLY_MIGRATIONS.md](APPLY_MIGRATIONS.md).

## Configuration

- `.env.example` contains only browser-safe Vite configuration.
- `backend-node/.env.example` documents server-side database, auth, AI, email,
  storage, payment, and security configuration.
- Never put a secret in a `VITE_*` value: Vite embeds it in the browser bundle.
- Do not point a local environment at a production database.

## Development and validation

```sh
npm test
npm run lint
npm run build

cd backend-node && npm run build
```

The frontend test suite has optional live-provider tests; they are skipped
unless explicitly configured. CI runs frontend build/test/lint plus security
scans. Backend and end-to-end coverage are being expanded.

## Self-hosting

Kourti Legal can run with Docker Compose for local development and can be
deployed behind a TLS reverse proxy with PostgreSQL and persistent storage.
Operators are responsible for access control, backups, key management, updates,
and applicable professional, privacy, and data-residency obligations.

## Contributing and security

- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Support](SUPPORT.md)
- [Governance](GOVERNANCE.md)
- [AI policy](docs/ai-policy.md)
- [CI/CD security and release controls](docs/CI_CD_SECURITY.md)

## License and trademarks

Kourti Legal source code is released under the [MIT License](LICENSE).
Third-party components retain their own terms; see [third-party notices](THIRD_PARTY_NOTICES.md).
The Kourti name and logos are not licensed for use as your own brand; see
[TRADEMARKS.md](TRADEMARKS.md).
