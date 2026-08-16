# Contributing to Kourti Legal

Thanks for helping improve Kourti Legal. By contributing, you agree that your
contribution is licensed under this repository's [MIT License](LICENSE).

## Before you start

- Read the [Code of Conduct](CODE_OF_CONDUCT.md) and [Security Policy](SECURITY.md).
- Do not open public issues for vulnerabilities or include credentials, client
  data, case materials, or other confidential information in issues, commits,
  fixtures, or screenshots.
- For substantial work, open an issue or Discussion first so maintainers can
  confirm direction and scope.

## Local development

The fastest complete setup is documented in [docs/docker-local-setup.md](docs/docker-local-setup.md).
For frontend work, install dependencies with `npm ci` and run `npm run dev`.
For backend work, copy `backend-node/.env.example` to `backend-node/.env`, use a
local PostgreSQL database, then run `npm ci` and `npm run dev` from `backend-node`.

## Pull requests

1. Branch from `main` and keep each pull request focused.
2. Add or update tests for behavior changes and update relevant documentation.
3. Run `npm test`, `npm run lint`, and `npm run build` at the repository root.
4. Run `npm run build` in `backend-node` for backend changes.
5. Describe user-visible changes, configuration changes, and security impact in
   the pull request.

Maintainers may request changes for correctness, security, accessibility,
documentation, or long-term maintainability. We use squash merges and reserve
the right to decline changes that do not fit the project roadmap.
