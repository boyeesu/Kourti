# Kourti Legal — Data Protection (GDPR / NDPR)

> **DRAFT — these documents are templates and must be reviewed and finalized
> with qualified data-protection counsel / a registered DPO before they are
> relied on or published.**

Kourti Legal is a **data processor** for its law-firm customers (who are the
controllers of their clients' data) and a **data controller** for its own
users, leads, billing and analytics. This folder is the source of truth for our
compliance posture.

## Documents

| Doc                                                      | Purpose                                                                                   |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [DPA.md](DPA.md)                                         | Customer-facing Data Processing Agreement (GDPR Art. 28) incl. TOMs + sub-processor annex |
| [SUBPROCESSORS.md](SUBPROCESSORS.md)                     | Register of third parties that process personal data + transfer safeguards                |
| [ROPA.md](ROPA.md)                                       | Record of Processing Activities (GDPR Art. 30)                                            |
| [RETENTION_POLICY.md](RETENTION_POLICY.md)               | Retention schedule + automated enforcement (Art. 5(1)(e))                                 |
| [DSAR_PROCEDURE.md](DSAR_PROCEDURE.md)                   | Handling data-subject requests (access/erasure/portability/objection)                     |
| [BREACH_RESPONSE_RUNBOOK.md](BREACH_RESPONSE_RUNBOOK.md) | Breach detection + 72-hour notification (Art. 33/34)                                      |

## How the code enforces this

| Control                                                 | Where                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Consent ledger (terms + marketing), versioned           | `consent_records` table · `services/consent.ts` · captured in `routes/api/onboarding.ts` and the public lead forms       |
| Marketing opt-in gating (no Brevo sync without consent) | `services/jwt.ts`, `routes/api/onboarding.ts`, `routes/api/public.ts`                                                    |
| One-click unsubscribe (stateless HMAC token)            | `services/consent.ts` · `GET/POST /api/v1/public/unsubscribe`                                                            |
| Right of access + portability (self-service export)     | `services/privacy.ts` · `GET /api/v1/users/me/export` · `GET /api/v1/portal/me/export`                                   |
| Right to erasure                                        | `services/privacy.ts` · `DELETE /api/v1/users/me` · `DELETE /api/v1/portal/me` · admin `POST /api/v1/admin/dsar/*/erase` |
| Right to rectification                                  | `PATCH /api/v1/users/me/profile` · `PATCH /api/v1/portal/me`                                                             |
| Right to object / restrict                              | `POST /api/v1/users/me/marketing-consent` · `POST /api/v1/users/me/processing-restriction`                               |
| Retention enforcement (automated)                       | `agents/retentionSweep.ts` (daily `retention_sweep` job) + `RETENTION_*` env vars                                        |
| Breach register + 72-hour clock                         | `breach_incidents` table · `services/security.ts` · `POST /api/v1/admin/breaches`                                        |
| Security-event / anomaly feed                           | `security_events` table · `services/securityEvents.ts`                                                                   |
| Data minimization (no PII over-fetch)                   | `lib/serialize.ts` (`publicProfile`)                                                                                     |
| Encryption in transit (DB cert validation)              | `db/pool.ts` — set `DB_SSL_CA` for verified TLS                                                                          |
| Field-level encryption at rest                          | `services/fieldCrypto.ts` — set `APP_ENCRYPTION_KEY`                                                                     |
| Cookie consent before analytics                         | app `index.html` + `src/components/CookieConsent.tsx`; marketing `index.html` + `CookieConsent.tsx`                      |

## Outstanding actions (require human/legal sign-off)

1. Appoint a DPO; register with the NDPC (Nigeria) as required under the NDPR/NDPA.
2. Execute the DPA with each subscribing law firm before they upload client data.
3. Execute DPAs / confirm no-training terms with LLM sub-processors (Anthropic, OpenAI, OpenRouter) and put SCCs in place for US transfers.
4. Set production secrets: `APP_ENCRYPTION_KEY`, `DB_SSL_CA`, `CLAMAV_HOST/PORT`, `TERMS_VERSION`, `PUBLIC_BASE_URL`, and the `RETENTION_*` overrides if the defaults don't fit.
5. Confirm the marketing-email unsubscribe footer links to `GET /api/v1/public/unsubscribe?email=…&token=…` (token = `unsubscribeToken(email)`).
6. Consider self-hosting Google Fonts to avoid an un-consented IP transfer.
