> **DRAFT — This document has not been reviewed by qualified legal counsel or a certified Data Protection Officer. It must not be relied upon as legal advice or treated as a finalised compliance instrument until reviewed and approved by a qualified DPO or data-protection lawyer familiar with Nigerian, EU/EEA, and UK data-protection law.**

---

# Data Retention & Deletion Policy

**Organisation:** Kourti Legal Technologies Ltd ("Kourti")
**Regulation:** GDPR Article 5(1)(e) (storage limitation) | Nigeria Data Protection Regulation 2019 (NDPR) Article 2.1(c)
**Document version:** DRAFT 2026-05-31
**Owner:** Data Protection Officer (to be appointed / current designee)
**Review cycle:** Annually, or on material change to processing

**Cross-references:**

- Processing activities and lawful bases: see [ROPA.md](./ROPA.md)
- Data subject erasure requests: see [DSAR_PROCEDURE.md](./DSAR_PROCEDURE.md) _(to be created)_
- Incident response: see [BREACH_RESPONSE_RUNBOOK.md](./BREACH_RESPONSE_RUNBOOK.md) _(to be created)_

---

## 1. Principles

1. **Storage limitation.** Personal data shall not be kept in a form that permits identification of data subjects for longer than is necessary for the purposes for which it was collected (GDPR Art. 5(1)(e); NDPR Art. 2.1(c)).
2. **Purpose limitation.** Data retained beyond its primary use period must be subject to a specific, documented secondary purpose (e.g. legal-hold, financial compliance) with a defined terminal date.
3. **Data minimisation on deletion.** Where full deletion is not possible (e.g. financial records under Nigerian tax law), fields containing personal data must be anonymised or pseudonymised in preference to retention of the full record.
4. **Automated enforcement.** Retention periods are enforced by scheduled database sweeper jobs (`retention_sweep` pg-boss jobs) — not manual processes. Engineering must keep sweeper coverage in sync with this policy.
5. **Legal hold override.** A legal-hold flag placed on a record (see §9) suspends automated deletion until the hold is lifted.

---

## 2. Configurable Defaults

The following environment variables control retention durations. Defaults are set conservatively within regulatory minima. Operators may extend (but should not shorten below the minimum legal floor) via environment configuration.

| Env variable                          | Default | Governs                                                                                                    |
| ------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| `AI_CONVERSATION_RETENTION_MONTHS`    | `12`    | Months after last activity before AI conversations are purged                                              |
| `EMAIL_LOG_RETENTION_MONTHS`          | `24`    | Months before `email_delivery_log` rows are hard-deleted                                                   |
| `AUDIT_LOG_RETENTION_MONTHS`          | `24`    | Months before `admin_actions` / `agent_audit_logs` rows are hard-deleted (standard; legal hold can extend) |
| `CONTACT_SUBMISSION_RETENTION_MONTHS` | `24`    | Months before `contact_submissions` leads are purged                                                       |
| `DOCUMENT_SOFT_DELETE_GRACE_DAYS`     | `30`    | Days after soft-delete before document hard-deletion                                                       |
| `CLOSED_ACCOUNT_ERASURE_DAYS`         | `30`    | Days after account deletion request before personal data is erased                                         |
| `FINANCIAL_RECORD_RETENTION_YEARS`    | `7`     | Years for billing / payment records (Nigerian tax law floor — do not reduce)                               |

> **Implemented variables (authoritative).** The variables above describe the
> intended policy surface. The variables actually parsed and enforced by the
> code today live in `backend-node/src/config/env.ts` and are expressed in
> **days**, not months. The mapping is:
>
> | Implemented env variable (env.ts)   | Default         | Governs                                                        | Policy row above                                            |
> | ----------------------------------- | --------------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
> | `RETENTION_AUDIT_LOG_DAYS`          | `730` (2 years) | `admin_actions`, `security_events`, `email_delivery_log` purge | `AUDIT_LOG_RETENTION_MONTHS` / `EMAIL_LOG_RETENTION_MONTHS` |
> | `RETENTION_EMAIL_LOG_DAYS`          | `730`           | `email_delivery_log` (legacy sweep)                            | `EMAIL_LOG_RETENTION_MONTHS`                                |
> | `RETENTION_AI_CONVERSATION_DAYS`    | `365`           | AI conversations idle window                                   | `AI_CONVERSATION_RETENTION_MONTHS`                          |
> | `RETENTION_CONTACT_SUBMISSION_DAYS` | `730`           | `contact_submissions`                                          | `CONTACT_SUBMISSION_RETENTION_MONTHS`                       |
> | `RETENTION_DELETED_DOC_GRACE_DAYS`  | `30`            | Soft-deleted document grace                                    | `DOCUMENT_SOFT_DELETE_GRACE_DAYS`                           |
> | `RETENTION_OTP_HOURS`               | `24`            | OTP code expiry                                                | —                                                           |
> | `RETENTION_RATE_LIMIT_DAYS`         | `7`             | Rate-limit rows                                                | —                                                           |
>
> When the month- and day-named variables disagree, the day-named variables in
> `env.ts` are the source of truth (they are what the running job reads).

---

## 3. Retention Schedule

### A. User Accounts & Authentication

| Data category                       | Table(s)                 | Retention period                                        | Trigger for deletion                                                   | Method                                                                                         |
| ----------------------------------- | ------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Staff user account (active)         | `auth_users`, `profiles` | Duration of active account                              | Account deletion request (DSAR erasure) or admin closure               | Hard delete `auth_users`; anonymise `profiles` (null PII fields, retain UUID for FK integrity) |
| Staff account (closed/suspended)    | `auth_users`, `profiles` | 30 days from closure/deletion request                   | `CLOSED_ACCOUNT_ERASURE_DAYS` sweeper                                  | Hard delete `auth_users`; anonymise/hard-delete `profiles` — subject to §G financial carve-out |
| Email OTP codes                     | `email_otp_codes`        | 24 hours after `expires_at`                             | `retention_sweep` pg-boss job on `expires_at + interval '24h' < now()` | Hard delete                                                                                    |
| TOTP secrets / recovery code hashes | `auth_users` (columns)   | Deleted with account; or immediately on TOTP disable    | Account closure; user disables TOTP                                    | Null the columns in-place                                                                      |
| Refresh tokens                      | `auth_users` (columns)   | 30 days from `refresh_token_expires_at`; rotated on use | Token expiry sweeper                                                   | Null the columns; hard-delete the row per account deletion schedule                            |
| Password reset tokens               | `auth_users` (columns)   | 1 hour from `password_reset_expires_at`                 | Token expiry sweeper                                                   | Null the columns                                                                               |
| Invitation tokens                   | `invitations`            | 7 days from `expires_at` (default)                      | Invitation expiry sweeper                                              | Hard delete expired invitations; accepted invitations — hard delete after 30 days              |
| Rate-limit records                  | `rate_limits`            | Immediately after `reset_at` passes                     | `retention_sweep` on `reset_at < now()`                                | Hard delete                                                                                    |
| Onboarding step metadata            | `user_onboarding_steps`  | Duration of active account                              | Account closure                                                        | Hard delete with account                                                                       |

### B. Law-Firm Client & Matter Data

> Kourti is a **Processor** for this data. The Controller (the law firm) sets retention requirements under the DPA. The defaults below apply in the absence of firm-specific instructions.

| Data category            | Table(s)                                                  | Retention period                                                                                | Trigger for deletion                                                  | Method                                                                  |
| ------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Client contact records   | `clients`                                                 | Active while firm subscription active. Firm-directed deletion via DSAR or firm account closure. | Firm account closure (30 days grace) or explicit firm-issued deletion | Hard delete; or anonymise if referenced by historical matters           |
| Cases / matters          | `cases`                                                   | Active while firm subscription active; closed cases — retain until firm account closure         | Firm account closure + 30-day grace                                   | Hard delete (check FK cascade to `case_events`, `case_client_messages`) |
| Contracts (full text)    | `contracts`                                               | Active while firm subscription active                                                           | Firm account closure + 30-day grace                                   | Hard delete                                                             |
| Documents — active       | `documents`, `document_versions`                          | Active while firm subscription active                                                           | Firm account closure or explicit deletion                             | Soft delete first → hard delete after grace period                      |
| Documents — soft-deleted | `documents` (deleted_at IS NOT NULL), `document_versions` | 30 days from `deleted_at` (`DOCUMENT_SOFT_DELETE_GRACE_DAYS`)                                   | `retention_sweep` on `deleted_at + interval '30 days' < now()`        | Hard delete DB row + unlink Garage/S3 object                            |
| Document edits (redline) | `document_edits`                                          | Cascade-deleted with parent document                                                            | Document hard-delete (ON DELETE CASCADE)                              | Hard delete                                                             |
| Calendar events          | `calendar_events`                                         | Active while firm subscription active; past events — retain 24 months then purge                | 24 months after `end_date`                                            | Hard delete                                                             |

### C. AI Processing

| Data category                | Table(s)                                                     | Retention period                                                                                 | Trigger for deletion                                                                       | Method                                                |
| ---------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| AI conversation metadata     | `ai_conversations`                                           | While account active; 12 months after last message activity (`AI_CONVERSATION_RETENTION_MONTHS`) | `retention_sweep` on `updated_at < now() - interval '[N] months'`; also on account erasure | Hard delete (cascades to messages)                    |
| AI conversation messages     | `ai_conversation_messages`                                   | Cascade with `ai_conversations`                                                                  | Parent conversation deletion                                                               | Hard delete (ON DELETE CASCADE)                       |
| Tabular review sessions      | `tabular_reviews`, `tabular_cells`                           | 12 months after `updated_at` with no activity; or on account erasure                             | `retention_sweep`; account erasure                                                         | Hard delete (cascades to cells, chats, chat messages) |
| Tabular review chat messages | `tabular_review_chat_messages`                               | Cascade with `tabular_review_chats`                                                              | Parent chat deletion                                                                       | Hard delete                                           |
| Agent jobs and steps         | `agent_jobs`, `agent_job_steps`                              | 24 months from `completed_at`                                                                    | `retention_sweep`                                                                          | Hard delete (job step cascade)                        |
| Agent audit logs             | `agent_audit_logs`                                           | 24 months (`AUDIT_LOG_RETENTION_MONTHS`) — legal hold may extend                                 | `retention_sweep`                                                                          | Hard delete (standard); retain on legal hold          |
| Agent approval requests      | `agent_approval_requests`                                    | 24 months from `created_at`                                                                      | `retention_sweep`                                                                          | Hard delete                                           |
| Negotiation records          | `negotiations`, `negotiation_turns`, `negotiation_positions` | Active + 12 months after `updated_at` inactivity                                                 | `retention_sweep`                                                                          | Hard delete (cascade)                                 |
| Intelligence snapshots       | `intelligence_snapshots`, `intelligence_recommendations`     | 6 months from `created_at` (stale snapshots replaced by new runs)                                | `retention_sweep`                                                                          | Hard delete                                           |

### D. Client Portal

| Data category                         | Table(s)                                     | Retention period                                                                              | Trigger for deletion                                       | Method                                              |
| ------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------- |
| Client user account (global identity) | `client_users`                               | Active while any firm portal access grant is active; 12 months post all-revocation inactivity | Post-revocation sweeper; erasure request                   | Hard delete (cascades to OTP codes, access records) |
| Client email OTP codes                | `client_email_otp_codes`                     | 24 hours after `expires_at`                                                                   | `retention_sweep` on `expires_at + interval '24h' < now()` | Hard delete                                         |
| Portal access grants                  | `client_case_access`, `client_portal_access` | Revoked grants: 24 months from `revoked_at`, then purge                                       | `retention_sweep`                                          | Hard delete                                         |
| Case events (client-visible)          | `case_events`                                | Lifecycle of the case + 24 months                                                             | Case/firm closure sweeper                                  | Hard delete                                         |
| Case-client messages                  | `case_client_messages`                       | Lifecycle of the case + 24 months                                                             | Case/firm closure sweeper                                  | Hard delete                                         |
| Client update digests                 | `client_update_digests`                      | 12 months from `sent_at` (or `created_at` for unsent)                                         | `retention_sweep`                                          | Hard delete                                         |
| Calendar RSVPs                        | `calendar_event_rsvps`                       | 12 months after the referenced `calendar_event.end_date`                                      | `retention_sweep`                                          | Hard delete                                         |

### E. Transactional Email

| Data category                      | Table(s)             | Retention period                                           | Trigger for deletion                                              | Method      |
| ---------------------------------- | -------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- | ----------- |
| Email delivery log (all providers) | `email_delivery_log` | 24 months from `created_at` (`EMAIL_LOG_RETENTION_MONTHS`) | `retention_sweep` on `created_at < now() - interval '[N] months'` | Hard delete |

### F. Marketing & CRM

| Data category                         | Table(s)              | Retention period                                                                                                           | Trigger for deletion                           | Method                                    |
| ------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------- |
| Contact form / assessment submissions | `contact_submissions` | 24 months from `created_at`, or upon objection / unsubscribe, whichever is earlier (`CONTACT_SUBMISSION_RETENTION_MONTHS`) | `retention_sweep`; objection handling via DSAR | Hard delete DB row + delete Brevo contact |
| Brevo contact records                 | Brevo SaaS (external) | Synced with `contact_submissions` deletion; Brevo unsubscribe also triggers deletion                                       | Objection / unsubscribe webhook                | Brevo API DELETE contact                  |

### G. Billing & Payments

| Data category            | Table(s)                   | Retention period                                                                                         | Trigger for deletion                   | Method                                                                                                                        |
| ------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Payment transactions     | `payment_transactions`     | **7 years** from `created_at` (Nigerian CIT Act / FIRS requirements; `FINANCIAL_RECORD_RETENTION_YEARS`) | Annual batch sweep after 7-year window | Anonymise PII fields (null `customer_email`, null `metadata` PII) while retaining financial amounts/references for accounting |
| Subscription records     | `subscriptions`            | 7 years from cancellation date                                                                           | As above                               | Anonymise; retain plan, dates, amount                                                                                         |
| Billing credits          | `billing_credits`          | 7 years from `created_at`                                                                                | Annual batch sweep                     | Anonymise `reason` if it contains PII                                                                                         |
| Subscription adjustments | `subscription_adjustments` | 7 years from `created_at`                                                                                | Annual batch sweep                     | Anonymise `reason` if it contains PII                                                                                         |

> **Legal floor:** The 7-year floor is set by Nigerian tax law. **Do not reduce** `FINANCIAL_RECORD_RETENTION_YEARS` below 7. GDPR Art. 6(1)(c) provides a lawful basis for retention to this floor even after an erasure request (DSAR must be responded to noting this exemption).

### H. Product Analytics

| Data category              | Table(s)      | Retention period                                                                        | Trigger for deletion           | Method                                        |
| -------------------------- | ------------- | --------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------- |
| Mixpanel events            | Mixpanel SaaS | Up to 60 months (Mixpanel default); configure to 24 months in Mixpanel project settings | Mixpanel project-level setting | Mixpanel data deletion API on erasure request |
| Microsoft Clarity sessions | Clarity SaaS  | 90 days (Microsoft default)                                                             | Automatic                      | Not applicable (short-lived)                  |

### I. Audit & Security Logs

| Data category          | Table(s)                 | Retention period                                                            | Trigger for deletion                                             | Method                                 |
| ---------------------- | ------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------- |
| Platform admin actions | `admin_actions`          | 24 months standard (`AUDIT_LOG_RETENTION_MONTHS`); 7 years under legal hold | `retention_sweep`; legal hold override (§9)                      | Hard delete (standard); retain on hold |
| Impersonation sessions | `impersonation_sessions` | 24 months from `created_at`                                                 | `retention_sweep`                                                | Hard delete                            |
| Agent audit logs       | `agent_audit_logs`       | 24 months (see also §C above)                                               | `retention_sweep`                                                | Hard delete                            |
| Feature overrides      | `feature_overrides`      | Until expiry then 12 months                                                 | `retention_sweep` on `expires_at + interval '12 months' < now()` | Hard delete                            |
| Lifecycle rules        | `admin_lifecycle_rules`  | Until disabled + 12 months                                                  | Admin deletion                                                   | Hard delete                            |

### J. Platform Support & Impersonation

(Covered by §I above — `impersonation_sessions` is the primary record; see also `admin_actions`.)

---

## 4. Automated Enforcement: Retention Sweep Jobs

Kourti enforces retention through **pg-boss scheduled jobs** named `retention_sweep`. Each sweep category is a separate named job to allow independent scheduling and failure recovery.

| Sweep job name                           | Frequency     | Scope                                                                                                                                                               |
| ---------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `retention_sweep:otp_expired`            | Every 6 hours | `email_otp_codes`, `client_email_otp_codes` where `expires_at + interval '24h' < now()`                                                                             |
| `retention_sweep:rate_limits`            | Every hour    | `rate_limits` where `reset_at < now()`                                                                                                                              |
| `retention_sweep:documents_soft_deleted` | Daily         | `documents` where `deleted_at + interval '[DOCUMENT_SOFT_DELETE_GRACE_DAYS] days' < now()` — hard-delete DB rows + unlink Garage objects                            |
| `retention_sweep:email_log`              | Weekly        | `email_delivery_log` where `created_at < now() - interval '[EMAIL_LOG_RETENTION_MONTHS] months'`                                                                    |
| `retention_sweep:audit_logs`             | Weekly        | `admin_actions`, `agent_audit_logs` where `created_at < now() - interval '[AUDIT_LOG_RETENTION_MONTHS] months'` AND no legal hold                                   |
| `retention_sweep:ai_conversations`       | Weekly        | `ai_conversations` where `updated_at < now() - interval '[AI_CONVERSATION_RETENTION_MONTHS] months'` — cascades to messages                                         |
| `retention_sweep:contact_submissions`    | Monthly       | `contact_submissions` where `created_at < now() - interval '[CONTACT_SUBMISSION_RETENTION_MONTHS] months'`                                                          |
| `retention_sweep:agent_jobs`             | Weekly        | `agent_jobs` where `completed_at < now() - interval '24 months'`                                                                                                    |
| `retention_sweep:invitations`            | Daily         | `invitations` where `expires_at + interval '7 days' < now()` and `status != 'accepted'`                                                                             |
| `retention_sweep:financial_records`      | Annually      | `payment_transactions`, `subscriptions` where `created_at < now() - interval '[FINANCIAL_RECORD_RETENTION_YEARS] years'` — anonymise PII fields, do not hard-delete |
| `retention_sweep:closed_accounts`        | Daily         | Accounts where deletion was requested and `CLOSED_ACCOUNT_ERASURE_DAYS` have passed                                                                                 |

> **Engineering note:** Every sweep job must write a completion event to `admin_actions` (action_type = 'retention_sweep') with a count of affected rows. This provides an auditable history of retention enforcement. Sweep failures must be alerted (Railway metrics / Slack alert). Never silently swallow errors in sweep jobs.

### 4a. Audit-log purge job (`retentionPurge.ts`) — implemented

In addition to the pg-boss `retention_sweep` jobs above, a dedicated audit-log
purge enforces the storage-limitation control for the three audit-bearing
tables. This is the job an auditor should reference for audit/security/email
log retention:

| Property          | Value                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| Script            | `backend-node/src/scripts/retentionPurge.ts` (`purgeExpiredAuditData()`)                                            |
| Tables purged     | `admin_actions`, `security_events`, `email_delivery_log`                                                            |
| Timestamp column  | `created_at` (each table)                                                                                           |
| Retention window  | `RETENTION_AUDIT_LOG_DAYS` (default **730 days = 2 years**); set to `0` to disable                                  |
| Schedule          | Runs once ~60s after server boot, then on a 24-hour interval (`setInterval`), wired in `backend-node/src/server.ts` |
| Failure behaviour | Best-effort per table — a failure or missing table is logged and never aborts the run or crashes the server         |
| Action            | Hard `DELETE` of rows older than the window                                                                         |

The purge is idempotent and safe to run repeatedly. It logs a per-table and
total row-count summary to stdout (captured in Railway logs) on each run.

---

## 5. Account Erasure Procedure (DSAR — Right to Erasure)

When a verified erasure request is received (see [DSAR_PROCEDURE.md](./DSAR_PROCEDURE.md)):

1. **Check for legal-hold flags** (§9) — if present, partial erasure only.
2. **Check for financial-record carve-out** (§3-G) — anonymise billing records; do not hard-delete.
3. **Check for Processor-role data** (Activity B/C/D in [ROPA.md](./ROPA.md)) — coordinate with the Controller (the law firm) before erasing firm-client data.
4. Execute the following in a single database transaction:
   - Null PII columns in `profiles` (first_name, last_name, email, department, disabled_reason)
   - Hard-delete `auth_users` row
   - Hard-delete `email_otp_codes` for the user
   - Null TOTP / recovery codes columns
   - Hard-delete `ai_conversations` (cascades to messages)
   - Null / remove identifying fields from `admin_actions`, `agent_audit_logs` where the user is the subject (but retain the audit record itself with user_id nulled)
   - Flag `email_delivery_log` rows with this user_id — null `to_email` after 30 days
5. **Sub-processors:** Submit deletion requests to Mixpanel (data deletion API), Brevo (if applicable), Resend (if applicable).
6. Respond to the data subject within 30 days (GDPR) / 14 days (NDPR) confirming erasure or citing exemption.

---

## 6. Soft-Delete Grace Period (Documents)

Documents deleted by a user (`DELETE /api/v1/documents/:id`) are **soft-deleted** by setting `documents.deleted_at`. The underlying Garage object is NOT immediately removed.

- During the grace period (`DOCUMENT_SOFT_DELETE_GRACE_DAYS`, default 30 days), the document is recoverable by a firm admin.
- After the grace period, the `retention_sweep:documents_soft_deleted` job:
  1. Deletes the Garage / S3 object using the `documents.file_path` reference.
  2. Deletes the `document_versions` rows (cascades to `document_edits`).
  3. Hard-deletes the `documents` row.
- The same logic applies to `document_versions.deleted_at`.

---

## 7. Firm Account Closure

When a law firm cancels their subscription and requests account closure:

1. A 30-day notice period begins (retained for potential reactivation).
2. After 30 days: all organisation-scoped data is queued for deletion via `retention_sweep:closed_accounts`.
3. Firm data deleted in cascade order: `documents` (soft-delete → hard-delete) → `cases` → `clients` → `contracts` → `ai_conversations` → `agent_jobs` → `subscriptions` (anonymise per §G) → `organizations`.
4. `payment_transactions` records are anonymised per §G (financial retention applies).
5. Kourti confirms deletion to the firm in writing within 30 days of data erasure completion.

---

## 8. Backup Retention

Database backups (Railway managed backups) have their own retention:

| Backup type     | Default retention |
| --------------- | ----------------- |
| Daily backups   | 7 days            |
| Weekly backups  | 4 weeks           |
| Monthly backups | 3 months          |

Personal data in backups is subject to the same eventual-deletion obligation. A deleted record may persist in backups for up to 3 months. This is disclosed in Kourti's Privacy Policy as a technical limitation. After the backup retention window expires, the backup containing the data is deleted automatically.

> **Note:** Backup restoration that would re-introduce deleted personal data must be treated as a re-processing event. Engineering must re-apply the retention sweep immediately after any backup restoration that pre-dates a known erasure event.

---

## 9. Legal Hold

A legal hold suspends automated deletion for specific records when:

- Litigation is anticipated or in progress.
- A regulator has requested preservation.
- A platform-admin has placed a manual hold via the `/thanos` admin surface.

**Implementation:**

- Legal holds are recorded in `admin_actions` with `action_type = 'legal_hold_placed'` and `target_type` + `target_id` identifying the specific record or organisation.
- The `retention_sweep` jobs must check for an active legal hold on any record before deletion. The hold is a flag in the `details` jsonb or a dedicated `legal_holds` table (to be implemented).
- When the legal hold is lifted (`action_type = 'legal_hold_lifted'`), the normal retention schedule resumes from the original trigger date (i.e., the record is eligible for immediate deletion if the retention period has already passed).

**Notification:** The Data Protection Officer must be notified whenever a legal hold is placed or lifted. Legal hold durations must be reviewed at least every 6 months.

---

## 10. Third-Party / Sub-Processor Retention

Kourti's control over sub-processor retention is contractual. For each sub-processor, the DPA or terms must specify:

| Sub-processor      | Our contractual retention control                                                |
| ------------------ | -------------------------------------------------------------------------------- |
| Railway            | Backups: configurable; DB data: deleted on service termination                   |
| Resend             | Email content not retained beyond delivery; logs per Resend DPA                  |
| Brevo              | Contact data: deleted via API on erasure request; max per Brevo DPA              |
| Paystack           | Transaction data: per Nigerian payment regulations; Paystack DPA                 |
| Anthropic / OpenAI | Prompts: not used for training (DPA clause required); retention per provider DPA |
| Mixpanel           | 60-month default; configure to 24 months; deletion API available                 |
| Microsoft Clarity  | 90-day default; no personal data should reach Clarity (masking required)         |

---

## 11. Retention Policy Review Log

| Date            | Version | Reviewer                   | Change summary                                |
| --------------- | ------- | -------------------------- | --------------------------------------------- |
| 2026-05-31      | DRAFT   | Engineering / DPO designee | Initial draft grounded in bootstrap.ts schema |
| _(next review)_ |         |                            | Annual review due 2027-05-31                  |

---

_This Retention Policy was drafted against the production database schema in `backend-node/src/db/bootstrap.ts` (revision 2026-05-31). It must be reviewed by qualified counsel and the DPO before use, and kept in sync with the processing activities described in [ROPA.md](./ROPA.md)._
