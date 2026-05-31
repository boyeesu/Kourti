# Client Portal — Implementation SPEC (v1)

This is the **contract** every sub-agent codes against. Do not deviate from
the signatures, table names, route paths, or JWT shape below. If something is
underspecified, follow the conventions already in the codebase (see the
"Patterns" section).

## The problem we are solving

Law firms manually keep clients updated on their matters (emails, calls,
meetings). We are automating an **end-to-end client view** of each matter plus
**proactive updates**, on top of the existing internal case-management app.

Two jobs:

1. **Visibility (pull):** a client logs in and sees where their matter(s) stand
   — timeline, documents, next steps, who's handling it.
2. **Updates (push):** the firm stops hand-writing update emails; an agent
   drafts plain-English updates from the case event stream, an attorney
   approves, and it's sent.

## CRITICAL design decision — global client identity (multi-firm)

A client (person) may be a client of **multiple law firms** in the portal. So:

- `client_users` is a **GLOBAL identity** keyed by email. It is **NOT scoped to
  an organization_id.** One login → many firms.
- Authorization to see a matter lives in `client_case_access` (deny-by-default).
  Each grant carries `organization_id`, so the portal can **label every matter
  with the firm it belongs to** and never mix two firms' data.
- The firm's existing per-org contact row (`public.clients`) links to the global
  identity via `clients.client_user_id`. One `client_user` ↔ many `clients` rows.

v1 builds the global model end-to-end and **labels matters by firm**. The
multi-firm _UX polish_ (firm switcher / grouping) is v2 — but the data model
must already support it, which it does here. Never add `organization_id` to
`client_users`.

## Feature gating — Professional + Enterprise only

The client portal is a paid feature. A new entitlement key **`client_portal`**
is added to the AUTOMATION set (Professional + Enterprise; trial maps to
professional so it's available in-trial). Enforcement is in TWO places:

1. **Staff side** — `/api/v1/client-portal` is mounted with
   `requireFeature('client_portal')`. A Starter firm cannot invite clients,
   grant access, or generate/send updates.
2. **Client side** — because a firm could downgrade _after_ granting access,
   the client-facing `/api/v1/portal` reads must filter by the firm's CURRENT
   entitlement. `assertCaseAccess` and `GET /matters` MUST drop any matter whose
   `organization_id` no longer has `client_portal` (use
   `hasFeature(organizationId, 'client_portal')` from `services/entitlements.js`).
   A downgraded firm's matters simply disappear from the client's view; the
   client keeps any matters from other firms that still have the feature.
   (The client identity itself is never gated — gating is always per-firm.)

## Security posture (non-negotiable)

- **Separate auth surface.** Client tokens are NOT staff tokens. Staff
  `verifyAccessToken` rejects client tokens and vice-versa (enforced via a
  `typ` claim — see JWT below).
- **Deny-by-default.** The portal serves a case ONLY if an active
  `client_case_access` row exists for `(client_user_id, case_id)`.
- **Visibility flag.** The portal serves case events ONLY where
  `client_visible = true`. Internal notes/strategy default to NOT visible.
- The portal API is its own router with its own middleware. It does NOT reuse
  the staff routers or `requireAuth`.

---

## Schema (already added to `src/db/bootstrap.ts` by the keystone owner)

Sub-agents: **do not re-add these**; just read/write them.

- `public.client_users` — global identity. Columns:
  `id, email, encrypted_password (nullable), full_name, phone, is_active,
email_verified_at, last_sign_in_at, refresh_token, refresh_token_expires_at,
invite_token, invite_expires_at, password_reset_token,
password_reset_expires_at, created_at, updated_at`.
  Unique index on `lower(email)`.
- `public.clients` — gains `client_user_id uuid` (FK → client_users) and
  `portal_enabled boolean default false`.
- `public.client_case_access` —
  `id, client_user_id, case_id, organization_id, client_id, role
('viewer'|'collaborator'), status ('active'|'revoked'), granted_by,
created_at, revoked_at`. Unique `(client_user_id, case_id)`.
- `public.case_events` — append-only timeline.
  `id, organization_id, case_id, event_type, title, body,
payload jsonb, actor_type ('staff'|'client'|'system'|'agent'), actor_id,
client_visible boolean default false, notified_at timestamptz,
occurred_at, created_at`.
- `public.case_client_messages` — two-way per-case thread.
  `id, case_id, organization_id, sender_type ('staff'|'client'), sender_id,
body, read_at, created_at`.
- `public.client_update_digests` — audit of generated/sent updates.
  `id, organization_id, case_id, client_user_id, status
('draft'|'approved'|'sent'|'failed'), channel, subject, body_md,
event_ids uuid[], generated_by_job_id, approved_by, approved_at, sent_at,
error, created_at`.
- `public.cases` — gains `client_summary text` (firm-curated plain-English
  "what's happening" blurb shown to the client).

### `event_type` vocabulary + default visibility

`recordCaseEvent` applies these defaults when `clientVisible` is not passed:

| event_type          | default client_visible | meaning                        |
| ------------------- | ---------------------- | ------------------------------ |
| `case_created`      | true                   | matter opened                  |
| `status_changed`    | true                   | status/stage moved             |
| `hearing_scheduled` | true                   | next_hearing_date set/changed  |
| `document_shared`   | true                   | a doc was shared to the client |
| `document_added`    | false                  | internal doc upload            |
| `task_completed`    | false                  | internal task done             |
| `note_added`        | false                  | internal note                  |
| `client_message`    | true                   | message in the client thread   |
| `invoice_sent`      | true                   | invoice issued to client       |
| `invoice_paid`      | true                   | payment recorded               |
| `update_sent`       | true                   | a digest update was sent       |

Anything not in the table defaults to **false** (safe).

---

## JWT shape for client portal (keystone owner sets signing/verify)

- Client access token claims: `{ sub: <client_user_id>, email, typ: 'client' }`,
  HS256, `env.JWT_SECRET`, expiry `env.JWT_EXPIRES_IN`.
- Client refresh token: `{ sub, typ: 'client_refresh' }`, `env.JWT_REFRESH_SECRET`.
- Staff `verifyAccessToken` rejects any token whose `typ` starts with `client`.
- `services/clientPortalAuth.ts` owns `signClientTokens`, `verifyClientAccessToken`,
  `verifyClientRefreshToken` (built by Agent A).

---

## Backend file ownership (parallel — disjoint files)

### Agent A — `src/services/caseEvents.ts`, `src/services/clientPortalAuth.ts`, `src/middleware/requireClientAuth.ts`

**`services/caseEvents.ts`** — the event-stream writer. Exact signature:

```ts
export type CaseEventType =
  | 'case_created'
  | 'status_changed'
  | 'hearing_scheduled'
  | 'document_shared'
  | 'document_added'
  | 'task_completed'
  | 'note_added'
  | 'client_message'
  | 'invoice_sent'
  | 'invoice_paid'
  | 'update_sent'
  | (string & {});

export interface RecordCaseEventInput {
  organizationId: string;
  caseId: string;
  eventType: CaseEventType;
  title?: string;
  body?: string;
  payload?: Record<string, unknown>;
  actorType?: 'staff' | 'client' | 'system' | 'agent'; // default 'staff'
  actorId?: string | null;
  clientVisible?: boolean; // when omitted, use DEFAULT_VISIBILITY[eventType] ?? false
}

/** Append one row to case_events. Best-effort: never throws to the caller —
 *  log and swallow, because event recording must not break the primary write. */
export async function recordCaseEvent(input: RecordCaseEventInput): Promise<void>;

export const DEFAULT_VISIBILITY: Record<string, boolean>; // the table above
```

**`services/clientPortalAuth.ts`** — global client identity auth. Export:

```ts
export interface ClientAuthUser {
  clientUserId: string;
  email: string;
}
export interface ClientTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; email: string; fullName: string | null };
}

export function signClientTokens(u: {
  id: string;
  email: string;
  fullName: string | null;
}): ClientTokens;
export function verifyClientAccessToken(token: string): ClientAuthUser; // throws ApiError on typ!=='client'
export function verifyClientRefreshToken(token: string): { sub: string };

// Auth flows (email + password; OTP optional v2). All throw ApiError on failure.
export async function clientSignIn(email: string, password: string): Promise<ClientTokens>;
export async function clientRefresh(refreshToken: string): Promise<ClientTokens>;
export async function clientSignOut(clientUserId: string): Promise<void>;
// Invite acceptance: client sets their password via the invite token emailed by the firm.
export async function acceptClientInvite(
  token: string,
  password: string,
  fullName?: string
): Promise<ClientTokens>;
export async function clientResetPasswordRequest(email: string): Promise<string | null>; // returns raw token or null
export async function clientResetPasswordConfirm(token: string, password: string): Promise<void>;

/** Find-or-create the GLOBAL client_user for an email (used by staff invite).
 *  Returns the client_user id and a freshly minted invite token (24h). */
export async function ensureClientUserForInvite(
  email: string,
  fullName?: string
): Promise<{ clientUserId: string; inviteToken: string; isNew: boolean }>;
```

Mirror `services/jwt.ts` conventions: bcrypt cost 12, sha256-hash refresh
tokens in DB, timing-safe compares, `ApiError` codes prefixed `CLIENT_AUTH_*`.

**`middleware/requireClientAuth.ts`** — sets `req.clientAuth` (typed by keystone
in express.d.ts as `{ clientUserId: string; email: string }`). Throws 401 if no
valid client token. Pattern mirrors `middleware/auth.ts`.

### Agent B — `src/routes/api/portal.ts` (client-facing) + `src/routes/api/clientPortal.ts` (staff)

**`routes/api/portal.ts`** — exported as `portalRouter`. Mounted by keystone at
`/api/v1/portal` behind `requireClientAuth` ONLY (no requireAuth /
requireActiveSubscription — clients aren't billed users). Auth sub-routes that
must be UNAUTHENTICATED (login/refresh/accept-invite/reset) are exported as a
SEPARATE `portalAuthRouter` mounted at `/api/v1/portal/auth` with NO middleware.

Endpoints (all client-scoped via `req.clientAuth.clientUserId`, deny-by-default
through `client_case_access`):

- `portalAuthRouter` (public):
  - `POST /login` {email,password} → ClientTokens
  - `POST /refresh` {refreshToken} → ClientTokens
  - `POST /accept-invite` {token,password,fullName?} → ClientTokens
  - `POST /forgot-password` {email} → {ok:true} (always; no enumeration)
  - `POST /reset-password` {token,password} → {ok:true}
  - `POST /logout` (reads bearer) → {ok:true}
- `portalRouter` (requireClientAuth):
  - `GET /me` → { id, email, fullName }
  - `GET /matters` → list of granted matters, **each labeled with firm**:
    `[{ caseId, title, clientSummary, status, firm:{organizationId,name,logoUrl},
   lastEventAt, unreadMessages }]`. Join client_case_access (status='active')
    → cases → organizations. Never leak org-internal fields.
  - `GET /matters/:caseId` → matter detail: case basics + `client_summary` +
    `firm` + next_hearing_date. 404 if no active access row.
  - `GET /matters/:caseId/timeline` → case_events where `client_visible=true`,
    ordered `occurred_at desc`. Map to `{id,eventType,title,body,occurredAt}`.
  - `GET /matters/:caseId/documents` → documents shared to the client. v1:
    documents linked to the matter's client_id AND surfaced via a
    `document_shared` event. Return name + a download URL via existing files
    signed-URL flow (read `routes/api/files.ts` for the pattern). If signed URLs
    are non-trivial cross-identity, return metadata only + `downloadUrl:null`
    and leave a `// TODO v2` — do NOT invent an insecure path.
  - `GET /matters/:caseId/messages` → case_client_messages asc; mark staff msgs read.
  - `POST /matters/:caseId/messages` {body} → insert sender_type='client',
    then `recordCaseEvent({eventType:'client_message', clientVisible:true,
actorType:'client', actorId:clientUserId, ...})`.

  Every handler MUST verify access with a helper:

  ```ts
  async function assertCaseAccess(
    clientUserId: string,
    caseId: string
  ): Promise<{ organizationId: string }>; // throws ApiError 404 NOT_FOUND if none
  ```

**`routes/api/clientPortal.ts`** — exported as `clientPortalRouter`. Mounted by
keystone at `/api/v1/client-portal` behind `requireAuth, requireActiveSubscription`
(staff side). Staff manage portal access + visibility + updates:

- `POST /cases/:caseId/invite` {email,fullName?} → finds-or-creates global
  client_user (`ensureClientUserForInvite`), upserts a `clients` row link +
  `portal_enabled=true`, inserts `client_case_access` (active), emails the
  invite (Agent C's `sendClientPortalInviteEmail`). Returns the access row.
- `GET /cases/:caseId/access` → list client_users with access to this case.
- `DELETE /cases/:caseId/access/:clientUserId` → set status='revoked'.
- `GET /cases/:caseId/events` → ALL case_events (staff view), newest first.
- `PATCH /cases/:caseId/events/:eventId` {clientVisible} → toggle a single
  event's visibility.
- `POST /cases/:caseId/events` {eventType,title,body,clientVisible?} → staff
  posts a manual update (calls recordCaseEvent).
- `PATCH /cases/:caseId/summary` {clientSummary} → update cases.client_summary.
- `GET /cases/:caseId/digests` → list client_update_digests for the case.
- `POST /cases/:caseId/digests/generate` → enqueue the digest agent (see Agent E):
  insert an `agent_jobs` row with `agent_type='client_update_digest'`,
  `input={caseId}`, then `getBoss().send('agent-jobs', {jobId})`. Read
  `routes/api/agents.ts` for the exact enqueue pattern.
- `POST /digests/:digestId/approve` → set status='approved', approved_by/at,
  then send via Agent C's `sendClientUpdateEmail`; on success status='sent',
  sent_at, and `recordCaseEvent({eventType:'update_sent', clientVisible:true})`,
  and stamp `notified_at=now()` on the included `event_ids`.
- `POST /digests/:digestId/discard` → status='failed' (discarded).

All staff endpoints scope every query by `req.auth.organizationId` and verify
the case belongs to that org before acting.

### Agent C — edit `src/services/email.ts` (ONLY this file)

Add two exports, reusing `wrapHtml`/`ctaButton`/`BRAND`/`getResend`. The portal
lives at `PORTAL_URL = process.env.PORTAL_URL || ${APP_URL}/portal`.

```ts
export async function sendClientPortalInviteEmail(args: {
  email: string;
  firmName: string;
  inviterName?: string;
  matterTitle: string;
  inviteToken: string;
}): Promise<{ messageId?: string }>;
// CTA → `${PORTAL_URL}/accept-invite?token=${inviteToken}`

export async function sendClientUpdateEmail(args: {
  email: string;
  firmName: string;
  clientName?: string;
  matterTitle: string;
  subject: string;
  bodyMarkdown: string;
  caseId: string;
}): Promise<{ messageId?: string }>;
// Render bodyMarkdown to simple HTML paragraphs (escape user content with the
// existing escapeHtml). CTA "View your matter" → `${PORTAL_URL}/matters/${caseId}`.
// from: `${firmName} <${FROM_EMAIL}>`.
```

### Agent D — wire emission into existing routes (edit `cases.ts`, `tasks.ts`, `documents.ts`, `invoices.ts` ONLY)

Import `recordCaseEvent` from `../../services/caseEvents.js`. Fire AFTER the
primary DB write succeeds, `await`ed but it never throws. Use `actorId =
req.auth.userId`, `organizationId = req.auth.organizationId`.

- `cases.ts` POST `/` → `case_created` (title = case title).
- `cases.ts` PATCH `/:id` → if `status` changed, `status_changed`
  (body = `"Status changed to <new>"`, payload `{from,to}`); if
  `next_hearing_date` changed to a non-null value, `hearing_scheduled`
  (payload `{date}`). Compare against the pre-update row (SELECT before UPDATE,
  or use RETURNING + a prior fetch).
- `tasks.ts` → when a task is marked completed (PATCH sets completed true and it
  was false, and the task has a case_id), `task_completed` (default invisible).
- `documents.ts` → on document create/upload with a `client_id`/matter link,
  `document_added` (default invisible). Resolve the case_id from the matter if
  the document references one; if documents aren't directly tied to a case in
  this codebase, attach the event to the case via client_id→cases lookup ONLY
  if unambiguous, else skip (leave `// TODO` note).
- `invoices.ts` → on invoice create/send → `invoice_sent`; on paid →
  `invoice_paid`. Use the invoice's case_id if present; else skip.

If a route's table/columns differ from assumptions, READ the file and adapt;
never guess column names. Keep diffs minimal and match the file's existing style.

### Agent E — `src/agents/clientUpdateDigest.ts` (new file)

Mirror `src/agents/matterReview.ts` (read it first for the registration +
pgboss pattern). Define an `AgentDefinition` named `client_update_digest` with
steps that:

1. Load the case + org + the client_user(s) with active access + the
   `case_events` for the case where `client_visible=true AND notified_at IS NULL`.
   If none, complete the job with output `{skipped:true,reason:'no new events'}`.
2. Use `ctx.llm(systemPrompt, userPrompt)` to draft a plain-English, firm-voiced
   client update (subject + body markdown) from those events + client_summary.
   System prompt: warm, concise, no legalese, no privileged content, no legal
   advice; summarize what happened and what's next. Include the event titles.
3. Insert a `client_update_digests` row with `status='draft'`, the `event_ids`,
   subject, body_md, client_user_id (first active grantee), generated_by_job_id.
   Do NOT send — staff approves via the route. Output `{digestId}`.

Register the handler so importing the module wires it into the worker (match
matterReview's `registerAgent`/export). Keystone adds the `import` to server.ts.

---

## Frontend ownership — Agent F (everything under `kouti-legal-hub-41/src/portal/` + App.tsx portal routes + a portal API client)

The client portal is a **separate surface** from the staff app — separate login,
separate token storage key (`kourti_portal_tokens`), its own minimal layout. Do
NOT route portal pages through `ProtectedRoute`/`AppLayout` (those assume staff
auth). Add top-level routes in `src/App.tsx`:

- `/portal/login`, `/portal/accept-invite`, `/portal/forgot-password`,
  `/portal/reset-password` (public)
- `/portal` (matters list), `/portal/matters/:caseId` (matter detail w/ timeline,
  documents, messages) — guarded by a small `PortalProtectedRoute` that checks
  portal tokens and redirects to `/portal/login`.

Create:

- `src/portal/portalApi.ts` — fetch wrapper hitting `/api/v1/portal*`, attaches
  the portal bearer token, handles 401 → refresh → retry, mirrors `lib/api.ts`
  conventions (read it). Token storage in localStorage under `kourti_portal_tokens`.
- `src/portal/PortalAuthContext.tsx` — login/logout/refresh + current client.
- `src/portal/pages/PortalLogin.tsx`, `PortalAcceptInvite.tsx`,
  `PortalForgotPassword.tsx`, `PortalResetPassword.tsx`.
- `src/portal/pages/PortalMatters.tsx` — list of matters, **each card shows the
  firm name** (multi-firm aware), status, last update time, unread count.
- `src/portal/pages/PortalMatterDetail.tsx` — header (matter title + firm +
  plain-English summary + next hearing), a **timeline** of visible events, a
  **documents** list, and a **messages** thread (read + post).
- `src/portal/PortalLayout.tsx` — minimal branded shell (logo, sign-out, firm
  context). Reuse existing `components/ui/*` (shadcn) + lucide icons + sonner.

Use `@tanstack/react-query` for data fetching (the app already uses it). Use
`react-router-dom` v6. Keep styling consistent with the existing app (Tailwind +
shadcn). The "key information a client needs" the detail page MUST surface:
**matter title, the firm handling it, current plain-English status/stage, the
latest updates (timeline), upcoming hearing/date, shared documents, who to
contact (messages), and any invoices flagged visible.**

---

---

# v1.1 ADDENDUM — OTP, client team invites, calendar exposure, document downloads

New schema (already added to bootstrap.ts by keystone — do NOT re-add):

- `client_users.otp_enabled boolean default true`
- `client_email_otp_codes(id, client_user_id, purpose('login'), code_hash, expires_at, attempts, used_at, created_at)`
- `documents.client_visible boolean default false` (a doc is shared to the client only when staff flip this true + emit `document_shared`). Case link stays in `documents.metadata->>'case_id'` (NO documents.case_id column in this codebase).
- `calendar_events` ensured + `client_visible boolean default true` (matter-linked events show to the client by default; staff can hide). It already has `case_id` / `client_id`.

Shared helper (keystone created): `services/portalAccess.ts` exports
`assertClientCaseAccess(clientUserId, caseId): Promise<{organizationId}>` —
deny-by-default + feature recheck, throws 404. EVERY portal feature router uses it.

## Agent 1 — Client OTP + portal document downloads (owns: `services/clientPortalAuth.ts`, `services/email.ts`, `routes/api/portal.ts`)

**Email OTP, on by default** (mirror `services/emailOtp.ts` + the staff MFA flow in `services/jwt.ts`):

- In `clientPortalAuth.ts` add an OTP module backed by `client_email_otp_codes`
  (purpose 'login'): `issueClientOtp(clientUserId,email)`, `verifyClientOtp(clientUserId,code)`.
  Reuse emailOtp.ts's conventions: 6-digit reject-sampled code, HMAC-SHA256 with
  JWT_SECRET, 10-min TTL, 30s resend cooldown, max 5 attempts, burn prior codes.
  Send via the new `sendClientOtpEmail` (below), NOT the staff sendEmailOtpEmail.
- Change `clientSignIn` to return a UNION:
  `type ClientSignInResult = (ClientTokens & {kind:'tokens'}) | {kind:'otp_required'; otpToken:string; otpTokenExpiresIn:number; emailHint:string}`.
  After a valid password: if `otp_enabled` (default true) → issue OTP, sign a
  short-lived (`600s`) JWT `{sub,email,typ:'client_otp'}` on JWT_SECRET as `otpToken`,
  return `kind:'otp_required'` with a masked `emailHint` (reuse a maskEmail helper).
  Else return `{kind:'tokens', ...}`.
- Add `clientVerifyOtp(otpToken,code): Promise<ClientTokens>` (verify the
  `typ:'client_otp'` JWT, then verifyClientOtp, then issue+store session tokens)
  and `clientResendOtp(otpToken): Promise<{otpTokenExpiresIn,emailHint}>`.
- `verifyClientAccessToken` already rejects non-'client' typ — keep it that way;
  the `client_otp` token must NOT authenticate the portal (it won't, since typ!=='client').
- `email.ts`: add `sendClientOtpEmail(email, code): Promise<{messageId?}>` — reuse
  wrapHtml/the big-code block style from sendEmailOtpEmail; subject "Your secure
  sign-in code". from: `${BRAND_NAME} <${FROM_EMAIL}>`.
- `portal.ts` auth routes: `/login` returns the union as-is (200 with `kind`).
  Add `POST /verify-otp {otpToken,code}` → ClientTokens; `POST /resend-otp {otpToken}` → {otpTokenExpiresIn,emailHint}.
- `portal.ts` documents endpoint: REPLACE the v1 stub. Now: select documents where
  `metadata->>'case_id' = :caseId AND organization_id = :org AND client_visible = true
AND deleted_at is null`; for each with a `file_path`, mint a real 15-min download
  URL via `createSignedUrl('documents', file_path, 900, organizationId)` (import from
  `../../services/storage.js`). Return `{id,name,mimeType,fileSize,createdAt,downloadUrl}`.
- ALSO: replace portal.ts's local `assertCaseAccess` with an import of
  `assertClientCaseAccess` from `../../services/portalAccess.js` (delete the local copy,
  update call sites) so there's one source of truth.

## Agent 2 — Client team invites (owns NEW file: `routes/api/portalTeam.ts`)

A client with access to a matter can invite their own colleagues to view that
matter (global identity reused — colleagues may already be clients of other firms).
Export `portalTeamRouter`. The app mounts it at `/api/v1/portal` behind requireClientAuth.
Import `assertClientCaseAccess` (portalAccess.js), `ensureClientUserForInvite`
(clientPortalAuth.js), `sendClientPortalInviteEmail` (email.js), `db`, `ApiError`,
`recordCaseEvent`. Routes:

- `GET /matters/:caseId/team` — assertClientCaseAccess, then list client_users with an
  ACTIVE client_case_access row on this case: `{clientUserId, email, fullName, pending}`
  where pending = (encrypted_password is null, i.e. invite not yet accepted). Include
  whether each row was invited by the requester (`invitedByMe = granted_by === me`).
- `POST /matters/:caseId/team {email, fullName?}` — assertClientCaseAccess. Then
  `ensureClientUserForInvite(email,fullName)` → upsert an ACTIVE client_case_access row
  for (newClientUserId, caseId, organizationId, role 'viewer', granted_by = requesting
  clientUserId) via `insert ... on conflict (client_user_id, case_id) do update set status='active', revoked_at=null`. Look up the firm name (organizations.name) + matter
  title (cases.title) and send `sendClientPortalInviteEmail` (best-effort; swallow+log).
  Guard: a client cannot invite themselves; cap is fine to skip in v1. Return the access row.
- `DELETE /matters/:caseId/team/:clientUserId` — assertClientCaseAccess. Only allow
  revoking a grant where `granted_by = requesting clientUserId` (clients can only remove
  teammates THEY invited, never the firm-granted primary or others). Set status='revoked',
  revoked_at=now(). 404 if no such self-invited active grant.

## Agent 3 — Calendar exposure (owns NEW file: `routes/api/portalCalendar.ts` + edits `routes/api/calendar.ts`)

**`portalCalendar.ts`** exports `portalCalendarRouter`, mounted at `/api/v1/portal`
behind requireClientAuth. Import `assertClientCaseAccess`. Return SAFE fields only
(title, description, start_date, end_date, location, event_type) — never attendees/internal.

- `GET /calendar` — upcoming events across ALL the client's accessible+feature-enabled
  matters. Join calendar_events e → client_case_access cca (active, client_user_id=me)
  on e.case_id = cca.case_id, where e.client_visible = true and e.end_date >= now()-interval '1 day',
  order by start_date asc. Re-check `hasFeature(org,'client_portal')` per org (or rely on
  a join that filters — simplest: filter in JS like portal.ts /matters does). Each item
  labeled with matter `{caseId, matterTitle, firm:{organizationId,name}}`.
- `GET /matters/:caseId/calendar` — assertClientCaseAccess, then events for that matter
  (client_visible=true) ordered by start_date asc.

**`calendar.ts`** edits (staff side): add `client_visible: z.boolean().optional()` to
create + update schemas; persist it (default true on create — add the column to the
insert/update). On create AND on update, when the event has a `case_id`, emit a
matter timeline event (best-effort) via `recordCaseEvent` (import from
`../../services/caseEvents.js`): eventType = `'hearing_scheduled'` when event_type
matches /hearing|court/i else `'calendar_event'`; clientVisible = the event's
client_visible; title = the event title; body = a short "<start_date> at <location>"
when present; payload = {calendarEventId, start_date, end_date, location}; actorType
'staff', actorId req.auth.userId, organizationId req.auth.organizationId, caseId = case_id.
Keep all existing calendar behavior intact; changes are additive.

## Agent 4 — Staff document sharing (owns: `routes/api/clientPortal.ts`)

Add staff endpoints so a firm controls which matter documents the client sees. Use the
existing `requireCaseInOrg` helper + `recordCaseEvent`. The case↔document link is
`documents.metadata->>'case_id'`.

- `GET /cases/:caseId/documents` — list org documents linked to this case
  (`metadata->>'case_id' = caseId AND organization_id = org AND deleted_at is null`),
  returning `{id,name,mimeType,fileSize,clientVisible,createdAt}` so staff can see what's shared.
- `POST /cases/:caseId/documents/:documentId/share` — verify the document is in the org;
  set `client_visible = true` and ensure its metadata case_id = caseId
  (`metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('case_id', $caseId::text)`);
  emit `recordCaseEvent({eventType:'document_shared', clientVisible:true, title:doc.name, ...})`.
- `DELETE /cases/:caseId/documents/:documentId/share` — set `client_visible = false`
  (unshare). No event needed.

## Mounting (keystone does this in app.ts)

`/api/v1/portal/auth` (public) → portalAuthRouter; then `requireClientAuth` once on
`/api/v1/portal`; then portalRouter, portalTeamRouter, portalCalendarRouter all at
`/api/v1/portal`. clientPortalRouter stays behind requireFeature('client_portal').

## Frontend (separate agent, after backend) — additive to src/portal/

- Login: handle `kind:'otp_required'` → show a 6-digit code step calling
  `/portal/auth/verify-otp` (+ a resend link → `/portal/auth/resend-otp`). Tokens only
  arrive after OTP. Update `portalApi.ts` login typing to the union + add verifyOtp/resendOtp.
- Matter detail: add a **Team** section (list teammates, invite by email, remove ones I
  invited) hitting `/portal/matters/:caseId/team`; add an **Upcoming dates / Calendar**
  section hitting `/portal/matters/:caseId/calendar`; wire document **downloads** to the
  now-real `downloadUrl` (open in new tab).
- Optionally a top "Upcoming" strip on the matters list from `/portal/calendar`.

---

# v1.2 ADDENDUM — CLIENT-LEVEL access model (refactor of the authorization spine)

Decision: portal access is **client-level by default with a per-matter privacy
escape hatch** (not per-matter opt-in). Enabling the portal for a client shares
ALL their matters (current + future); a matter can be marked `portal_private` to
exclude it. The old per-matter `client_case_access` stays as a SECONDARY explicit
grant path that OVERRIDES privacy (for unusual cases like a non-client third party).

New schema (already in bootstrap — do NOT re-add):

- `client_portal_access(id, client_user_id, client_id, organization_id, role,
status, granted_by, granted_by_type('staff'|'client'), created_at, revoked_at,
unique(client_user_id, client_id))` — the client-level grant, keyed on the firm's
  `clients.id`.
- `cases.portal_private boolean default false`.

### THE canonical access predicate (use everywhere; no other interpretation)

A client_user `:me` can see case `C` ⇔ `hasFeature(C.organization_id,'client_portal')` AND:

```
explicit    := EXISTS(client_case_access cca
                 WHERE cca.client_user_id=:me AND cca.case_id=C.id AND cca.status='active')
clientLevel := EXISTS(client_portal_access cpa
                 WHERE cpa.client_user_id=:me AND cpa.status='active'
                   AND cpa.client_id = C.client_id)
visible     := explicit OR (clientLevel AND COALESCE(C.portal_private,false) = false)
```

Endpoint response SHAPES do NOT change — only the access logic. No `app.ts` mount
changes. The running frontend is unaffected.

## Agent X — read spine (owns: `services/portalAccess.ts`, `routes/api/portal.ts`, `routes/api/portalCalendar.ts`)

- `portalAccess.ts`: rewrite `assertClientCaseAccess(clientUserId, caseId)` to the
  predicate above. Single query against `cases c` computing `explicit`,
  `clientLevel`, `portal_private`, `organization_id`; access = explicit OR
  (clientLevel AND NOT portal_private); then `hasFeature`; throw 404 otherwise;
  return `{organizationId}`. Keep the signature identical.
- `portal.ts` GET `/matters`: change the FROM from `client_case_access` to
  `cases c join organizations o` filtered by the predicate (inline the two EXISTS
  - `(explicit OR (clientLevel AND NOT coalesce(c.portal_private,false)))`). Keep
    lastEvent/unread subqueries + the JS hasFeature filter + response shape identical.
- `portalCalendar.ts` GET `/calendar`: same — join `calendar_events e` →
  `cases c` → `organizations o` where `e.client_visible AND e.end_date >= now()-1d`
  AND the access predicate; keep labeling + JS feature filter + shape.

## Agent Y — staff side (owns: `routes/api/clientPortal.ts`, `routes/api/cases.ts`)

- `clientPortal.ts` POST `/cases/:caseId/invite`: change from per-matter to
  **client-level**. After ensureClientUserForInvite + linking `clients`
  (client_user_id, portal_enabled=true): if the case has a `client_id`, upsert a
  `client_portal_access` row (client_user_id, client_id=case.client_id, org,
  role 'viewer', granted_by=staff userId, granted_by_type 'staff', status active)
  `on conflict (client_user_id, client_id) do update set status='active', revoked_at=null`.
  If `client_id` is NULL (matter has no client contact), FALL BACK to the existing
  per-matter `client_case_access` insert. Send the invite email as today.
- `clientPortal.ts` GET `/cases/:caseId/access` + DELETE `.../access/:clientUserId`:
  update to the client-level model — list = client_users who can see the matter
  (client_portal_access on the case's client_id, plus any explicit client_case_access
  on the case); revoke = set the matching client-level grant (for this client_id) to
  revoked, and also revoke any explicit per-matter grant for the case. Keep response shapes.
- NEW `clientPortal.ts` PATCH `/cases/:caseId/private {private:boolean}` →
  set `cases.portal_private` (org-scoped via requireCaseInOrg). Returns {caseId, portalPrivate}.
- `cases.ts`: add `portal_private` (optional boolean) to create + update schemas and
  persist it, so a matter can be created/edited private. Additive; keep event emission intact.

## Agent Z — client team grants (owns: `routes/api/portalTeam.ts`)

Rework team grants to client-level (a client's colleagues see the same matters):

- POST `/matters/:caseId/team`: assertClientCaseAccess; resolve the case's `client_id`.
  If non-null → upsert `client_portal_access` (new client_user, client_id, org,
  role 'viewer', granted_by = requesting clientUserId, granted_by_type 'client', active)
  on conflict do update active. If `client_id` is NULL → fall back to per-matter
  `client_case_access` (as today). Send invite email. Self-invite guard stays.
- GET `/matters/:caseId/team`: list = client_users with client-level access to the
  case's client_id (client_portal_access) UNION explicit per-matter grants for the case;
  fields {clientUserId,email,fullName,pending,invitedByMe(granted_by===me)}.
- DELETE `/matters/:caseId/team/:clientUserId`: revoke only grants where
  `granted_by = requesting clientUserId` — across BOTH tables (client_portal_access for
  the case's client_id, and client_case_access for the case). 404 if none.

Keystone (me): bootstrap schema (done) + integration build. No app.ts change.

---

# ROADMAP (post-v1.2)

- **Contracts in the portal (next major).** The firm drafts contracts FOR the client;
  the portal becomes the medium to **view, comment, and collaborate across the full
  lifecycle, versioned**. Build on existing infra: `contracts` + `documents` +
  `document_versions` + `document_edits` (tracked changes) already exist for staff.
  Plan: (1) a portal contract surface gated by the same client-level access +
  `portal_private`; (2) expose `document_versions` so the client sees each draft/version
  with a clear "current" pointer; (3) a **comment/redline thread per contract version**
  (extend the existing `document_edits`/comment model OR a new `contract_comments`
  table scoped to (contract/document_version, author_type staff|client)); (4) lifecycle
  states surfaced to the client (draft → shared for review → changes requested → signed),
  each emitting a `case_event` so it lands in the timeline; (5) notifications via the
  client-update digest agent when a new version or comment is posted. Reuse
  `case_client_messages` patterns for the comment thread and the signed-URL flow for
  version downloads. e-signature is a later sub-item. Keep privilege posture: only
  versions explicitly shared to the client are visible.
- Client-identity-safe document signed URLs — DONE in v1.1 (createSignedUrl capability URLs).
- Multi-firm UX polish (firm switcher / grouping on the matters list).
- Calendar: client RSVP / add-to-calendar (.ics) for hearings.
- Client OTP: allow firms to require it or let clients manage a second factor.

---

# v1.3 ADDENDUM — firm switcher/grouping, calendar RSVP + .ics, firm-enforced OTP

New schema (already in bootstrap — do NOT re-add):

- `organizations.portal_require_otp boolean default false` — firm policy: force client OTP.
- `calendar_event_rsvps(id, calendar_event_id, client_user_id, response('accepted'|'declined'|'tentative'), created_at, updated_at, unique(calendar_event_id, client_user_id))`.

## Agent 1 — Calendar RSVP (owns: `routes/api/portalCalendar.ts`)

Add client RSVP and surface the client's current response in the calendar reads.

- Both existing GET handlers (`/calendar` and `/matters/:caseId/calendar`): LEFT JOIN
  `calendar_event_rsvps rs on rs.calendar_event_id = e.id and rs.client_user_id = :me`
  and add `rsvp: rs.response | null` to each item. Keep all existing fields/filters/shapes.
- NEW `PUT /matters/:caseId/calendar/:eventId/rsvp {response}` (response ∈ accepted|declined|tentative):
  `assertClientCaseAccess(clientUserId, caseId)`; verify the event belongs to that case AND
  `client_visible = true` (404 otherwise); upsert calendar_event_rsvps
  `on conflict (calendar_event_id, client_user_id) do update set response=excluded.response, updated_at=now()`.
  Then best-effort `recordCaseEvent({organizationId, caseId, eventType:'calendar_rsvp',
title:'Client responded to <event title>', body:'<Accepted|Declined|Tentative>',
clientVisible:true, actorType:'client', actorId:clientUserId, payload:{calendarEventId, response}})`
  (import recordCaseEvent + assertClientCaseAccess; resolve organizationId from assert result).
  Return `{eventId, response}`. Use zod for params (uuid) + body.

## Agent 2 — Firm-enforced OTP (owns: `services/clientPortalAuth.ts`, `routes/api/clientPortal.ts`)

- `clientPortalAuth.ts clientSignIn`: after validating the password, OTP is required when
  `user.otp_enabled !== false` OR any firm the client has ACTIVE access to requires it. Add a
  query: `select exists(select 1 from public.organizations o where o.portal_require_otp = true
and (exists(select 1 from public.client_portal_access cpa where cpa.client_user_id=$1 and
cpa.status='active' and cpa.organization_id=o.id) or exists(select 1 from
public.client_case_access cca where cca.client_user_id=$1 and cca.status='active' and
cca.organization_id=o.id))) as required` with $1=user.id. If `otp_enabled!==false || required`
  → issue OTP challenge (existing code path); else issue tokens. Keep the union return type.
- `clientPortal.ts` (staff, org-scoped): add `GET /settings` → `{requireOtp:boolean}` (read
  organizations.portal_require_otp for req.auth.organizationId) and `PATCH /settings {requireOtp:boolean}`
  → update it, return `{requireOtp}`. Match the file's zod + asyncHandler + ApiError style.

## Agent 3 — Portal frontend: firm grouping + RSVP + .ics (owns: `src/portal/pages/PortalMatters.tsx`, `src/portal/pages/PortalMatterDetail.tsx`, `src/portal/portalApi.ts`)

- portalApi.ts: add `portalRsvpEvent(caseId, eventId, response)`; add `rsvp` to the calendar event
  types; add a pure helper `buildEventIcs(event): string` + `downloadIcs(event)` (client-side .ics —
  VCALENDAR/VEVENT with UID, DTSTART/DTEND in UTC `yyyymmddThhmmssZ`, SUMMARY, DESCRIPTION, LOCATION;
  escape commas/semicolons/newlines per RFC5545). No backend call for .ics.
- PortalMatters.tsx: when matters span >1 firm, GROUP the list by firm (firm name header per group)
  AND add a firm filter (All / per-firm chips or a Select). Single-firm clients see no extra chrome.
  Keep the existing card content + "Upcoming" strip.
- PortalMatterDetail.tsx: in the calendar/"Upcoming dates" section, add per-event RSVP controls
  (Accepted / Tentative / Declined) calling portalRsvpEvent + react-query invalidation + sonner toast,
  reflecting the current `rsvp`; and an "Add to calendar" button → downloadIcs(event). Match existing styling.

## Agent 4 — Staff frontend: firm-enforced OTP toggle (owns: `src/components/clientPortal/ClientPortalPanel.tsx`, `src/features/clientPortal/api.ts`)

- api.ts: add `useClientPortalSettings()` (GET /settings) + `useUpdateClientPortalSettings()` (PATCH /settings {requireOtp}).
- ClientPortalPanel.tsx: in the Access tab, add an ORG-WIDE switch "Require 2FA for all client sign-ins"
  (clearly labeled as firm-wide, not per-matter) bound to the settings hooks, with a toast on change.

## Patterns (follow these — they're already in the codebase)

- Routes: `Router()` + `asyncHandler(async (req,res)=>{...})`, zod-parse params/
  body/query, `ApiError(msg,status,CODE)`, parameterized `db.query`. Always scope
  by org/identity in the SQL `WHERE`.
- Never string-interpolate user input into SQL. Use `$1,$2,...`.
- `db` from `../../db/pool.js` (routes) / `../db/pool.js` (services/agents).
- ESM imports use `.js` extensions on relative paths (TS + NodeNext).
- Money/text/UUID coercion: see `cases.ts` `optionalUuid`/`optionalString` helpers.
- Build check: `cd backend-node && npm run build` (tsc) must pass; frontend
  `cd kouti-legal-hub-41 && npm run build` (tsc + vite) must pass.

```

```
