# CI/CD security and release controls

This repository uses GitHub Actions for validation and release automation. The
workflows are deliberately secretless for pull requests and use least-privilege
GitHub tokens.

## Workflows

| Workflow   | Purpose                                                                                | Permission model                                   |
| ---------- | -------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `CI`       | Frontend lint, test, build; backend build                                              | `contents: read`                                   |
| `Lint`     | Fast frontend lint check                                                               | `contents: read`                                   |
| `Security` | npm audits, historical secret scan, TypeScript check, Trivy filesystem/Dockerfile scan | `contents: read`                                   |
| `CodeQL`   | JavaScript/TypeScript static analysis                                                  | `contents: read`, `security-events: write`         |
| `Release`  | Validates a version tag and publishes source archive + SHA-256 checksum                | `contents: write`, protected `release` environment |

All third-party actions are pinned to immutable commit IDs. Dependabot opens
reviewable updates for npm dependencies and GitHub Actions.

## Required GitHub configuration

Repository administrators must configure these controls in GitHub; a workflow
file cannot enforce them on its own.

1. Protect `main`: require pull requests, at least one approving review, and
   successful `CI`, `Lint`, `Security`, and `CodeQL` checks. Restrict direct
   pushes, force pushes, and branch deletion.
2. Enable GitHub Advanced Security features available for the repository:
   secret scanning, push protection, Dependabot alerts, and private
   vulnerability reporting.
3. Create the `release` GitHub Environment, then require approval from release
   maintainers. Do not add long-lived cloud credentials to repository secrets.
4. Limit Actions to verified/pinned actions where organization settings allow
   it, and require approval for workflows from first-time contributors.
5. Configure a verified security-reporting channel in GitHub that matches
   [SECURITY.md](../SECURITY.md).

## Release procedure

1. Ensure `main` is green and dependency-audit findings are addressed or have a
   documented, time-bound exception.
2. Create and push a signed version tag matching `v*` (for example `v1.0.0`).
3. The `Release` workflow re-runs frontend and backend validation, packages the
   exact tagged source with `git archive`, generates `SHA256SUMS.txt`, and
   creates the GitHub Release.
4. A release maintainer approves the protected `release` environment.
5. Publish/deploy only from the resulting release artifact. Production
   deployment should be a separate protected workflow once a hosting provider,
   target environment, and short-lived identity mechanism are selected.

## Security expectations

- Never add production secrets, customer data, or database dumps to Git.
- Use GitHub Environment secrets and OpenID Connect with short-lived cloud
  credentials for future deployment workflows; avoid long-lived access keys.
- Review high and critical audit findings before merging. The security workflow
  intentionally fails on them.
- Keep Docker base images, action pins, and dependency lockfiles up to date.
