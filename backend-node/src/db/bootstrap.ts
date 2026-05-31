import { db } from './pool.js';
import { DEFAULT_PLAN_FEATURES } from '../services/entitlements.js';
import { DEFAULT_PLAN_LIMITS } from '../services/limits.js';

// Seed rows for plan_features, generated from the code default matrix. Values
// are code constants (no user input), safe to inline. ON CONFLICT DO NOTHING
// preserves any admin edits across redeploys.
const planFeatureSeedValues = Object.entries(DEFAULT_PLAN_FEATURES)
  .flatMap(([plan, keys]) => keys.map((k) => `('${plan}','${k}',true)`))
  .join(',');

// Seed rows for plan_limits (only finite caps; omitted keys = unlimited).
// Code constants, ON CONFLICT DO NOTHING preserves admin edits.
const planLimitSeedValues = Object.entries(DEFAULT_PLAN_LIMITS)
  .flatMap(([plan, limits]) =>
    Object.entries(limits).map(([k, v]) => `('${plan}','${k}',${Number(v)})`)
  )
  .join(',');

const bootstrapStatements = [
  `create extension if not exists pgcrypto`,
  `
  create table if not exists public.auth_users (
    id uuid primary key default gen_random_uuid(),
    email text unique not null,
    encrypted_password text not null,
    is_active boolean not null default true,
    email_confirmed_at timestamptz,
    refresh_token text,
    refresh_token_expires_at timestamptz,
    password_reset_token text,
    password_reset_expires_at timestamptz,
    last_sign_in_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
  `,
  `
  create table if not exists public.profiles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid unique not null,
    organization_id uuid not null,
    email text,
    first_name text,
    last_name text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
  `,
  `
  create table if not exists public.clients (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    name text not null,
    email text,
    phone text,
    company text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
  `,
  `
  create table if not exists public.organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    type text,
    email text,
    description text,
    address text,
    state text,
    country text,
    phone text,
    website text,
    logo_url text,
    status text default 'active',
    is_active boolean default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
  `,
  `
  create table if not exists public.contracts (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    created_by uuid not null,
    client_id uuid,
    title text not null,
    description text,
    content text,
    status text not null default 'draft',
    value numeric,
    currency text,
    start_date date,
    end_date date,
    contract_type text,
    terms text,
    metadata jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
  `,
  `
  create table if not exists public.cases (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    created_by uuid not null,
    client_id uuid,
    title text not null,
    description text,
    status text not null default 'open',
    priority text,
    next_hearing_date timestamptz,
    case_type_id uuid,
    case_issue_id uuid,
    assigned_to uuid,
    custom_fields jsonb,
    court text,
    case_number text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
  `,
  `
  create table if not exists public.documents (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    created_by uuid not null,
    client_id uuid,
    name text not null,
    contract_type text,
    currency text,
    effective_date date,
    renewal_date date,
    termination_date date,
    value numeric,
    terms text,
    summary text,
    content text,
    metadata jsonb,
    file_path text,
    file_size bigint,
    mime_type text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
  `,
  `
  create table if not exists public.conversations (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    type text not null default 'direct',
    name text,
    created_by uuid not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
  `,
  `
  create table if not exists public.conversation_participants (
    conversation_id uuid not null,
    user_id uuid not null,
    joined_at timestamptz not null default now(),
    last_read_at timestamptz,
    primary key (conversation_id, user_id)
  )
  `,
  `
  create table if not exists public.messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null,
    sender_id uuid not null,
    content text not null,
    message_type text not null default 'text',
    metadata jsonb,
    reply_to_id uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
  `,
  `
  create table if not exists public.ai_conversations (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    user_id uuid not null,
    title text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
  `,
  `
  create table if not exists public.ai_conversation_messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null,
    role text not null,
    content text not null,
    created_at timestamptz not null default now()
  )
  `,
  `
  create table if not exists public.admin_actions (
    id uuid primary key default gen_random_uuid(),
    admin_user_id uuid not null,
    action_type text not null,
    target_type text not null,
    target_id text,
    details jsonb,
    ip_address text,
    user_agent text,
    created_at timestamptz not null default now()
  )
  `,
  `
  create table if not exists public.user_plans (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    price_monthly numeric,
    price_yearly numeric,
    currency text default 'USD',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
  `,
  `
  create table if not exists public.subscriptions (
    id uuid primary key default gen_random_uuid(),
    plan_id uuid,
    status text,
    billing_interval text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
  `,
  // Per-user plan grants made by a platform admin. Distinct from
  // `subscriptions` (the paid/Paystack entitlement): this is the manual /
  // comp grant path. `organization_id` lets admins assign a plan to a whole
  // org in one action (one row per current member, all tagged with the org).
  // Previously referenced by routes but never created (Supabase-era leftover),
  // so every read defensively swallowed the missing-table error.
  `
  create table if not exists public.user_plan_assignments (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid,
    user_id uuid not null,
    plan_id uuid not null,
    assigned_by uuid,
    status text not null default 'active',
    starts_at timestamptz not null default now(),
    expires_at timestamptz,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
  `,
  // Defensive: if an environment already has this table from an earlier
  // shape, make sure the org column / audit fields exist before we index them.
  `alter table public.user_plan_assignments add column if not exists organization_id uuid`,
  `alter table public.user_plan_assignments add column if not exists expires_at timestamptz`,
  `alter table public.user_plan_assignments add column if not exists notes text`,
  `create index if not exists idx_upa_user_status
     on public.user_plan_assignments(user_id, status)`,
  `create index if not exists idx_upa_org_status
     on public.user_plan_assignments(organization_id, status)`,
  // Backfill organization_id for any assignment rows that pre-date the column.
  `update public.user_plan_assignments upa
      set organization_id = p.organization_id
     from public.profiles p
    where p.user_id = upa.user_id
      and upa.organization_id is null`,
  `
  create table if not exists public.invitations (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    email text not null,
    first_name text,
    last_name text,
    role text,
    department text,
    token text unique not null,
    status text not null default 'pending',
    invited_by uuid,
    expires_at timestamptz not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
  `,
  `
  create table if not exists public.global_roles (
    role text not null,
    display_name text not null,
    description text,
    created_at timestamptz not null default now()
  )
  `,
  // Deduplicate global_roles and ensure unique constraint
  `delete from public.global_roles a using public.global_roles b
   where a.ctid < b.ctid and a.role = b.role`,
  `do $$ begin
    alter table public.global_roles add constraint global_roles_pkey primary key (role);
    exception when others then null;
   end $$`,
  `do $$ begin
    insert into public.global_roles (role, display_name, description) values
      ('superadmin', 'Super Administrator', 'Full system access across all resources');
    exception when unique_violation then null;
   end $$`,
  `do $$ begin
    insert into public.global_roles (role, display_name, description) values
      ('admin', 'Administrator', 'Organization-level administration');
    exception when unique_violation then null;
   end $$`,
  `do $$ begin
    insert into public.global_roles (role, display_name, description) values
      ('user', 'User', 'Standard user access');
    exception when unique_violation then null;
   end $$`,
  `
  create table if not exists public.user_roles (
    id uuid primary key default gen_random_uuid(),
    role_name text not null,
    description text,
    permissions jsonb default '[]',
    organization_id uuid not null,
    created_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (role_name, organization_id)
  )
  `,
  `
  create table if not exists public.role_permissions (
    id uuid primary key default gen_random_uuid(),
    role_name text not null,
    organization_id uuid not null,
    resource text not null,
    action text not null,
    granted boolean not null default false,
    created_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (role_name, organization_id, resource, action)
  )
  `,
  `create index if not exists idx_role_permissions_role on public.role_permissions(role_name, organization_id)`,
  `
  create table if not exists public.user_role_assignments (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    role_name text not null,
    organization_id uuid not null,
    assigned_by uuid,
    created_at timestamptz not null default now(),
    unique (user_id, role_name, organization_id)
  )
  `,
  `alter table public.auth_users add column if not exists login_count integer default 0`,
  // Legacy user_role_assignments rows were inserted before the assigned_by
  // column was added; bootstrap's superadmin seed doesn't supply one either.
  // Make sure it isn't enforced NOT NULL.
  `alter table public.user_role_assignments alter column assigned_by drop not null`,
  // Older deployments created public.cases without a primary-key constraint
  // on id, so foreign keys that reference cases(id) (tabular_reviews, etc)
  // fail to be created with "no unique constraint matching". Idempotent
  // guard: only add the PK if it isn't already there.
  `do $$ begin
     if not exists (
       select 1 from pg_constraint
        where conrelid = 'public.cases'::regclass and contype = 'p'
     ) then
       alter table public.cases add constraint cases_pkey primary key (id);
     end if;
   end $$`,
  // L1 fix — drop the all-zeros placeholder org UUID. profiles.organization_id
  // was previously non-null with a zero-UUID sentinel for "no org yet";
  // a stray `WHERE organization_id IS NOT NULL` could have leaked data
  // across the placeholder. Make the column nullable and convert
  // existing zero-UUID rows to NULL.
  `alter table public.profiles alter column organization_id drop not null`,
  `update public.profiles set organization_id = null where organization_id = '00000000-0000-0000-0000-000000000000'`,
  // Functional index on lower(email) so case-insensitive sign-in lookups
  // are O(log n) rather than seq-scan, and so the timing of WHERE
  // lower(email)=lower($1) doesn't depend on table size (defense in
  // depth against user-enumeration timing attacks; also performance).
  `create unique index if not exists idx_auth_users_email_lower on public.auth_users (lower(email))`,
  // Rate-limit table previously created at runtime via lib import.
  // Moved here so DB sync failures are loud at startup instead of
  // silently degrading rate limits to in-memory only.
  `
  create table if not exists public.rate_limits (
    key text primary key,
    count integer not null default 1,
    reset_at timestamptz not null
  )
  `,
  `create index if not exists idx_rate_limits_reset on public.rate_limits(reset_at)`,
  // 2FA / TOTP columns. nullable by default — existing users keep
  // single-factor sign-in until they enrol.
  `alter table public.auth_users add column if not exists totp_secret text`,
  `alter table public.auth_users add column if not exists totp_enabled boolean not null default false`,
  `alter table public.auth_users add column if not exists totp_recovery_codes_hash text[]`,
  // ── Email OTP (default-on 2FA) ────────────────────────────────────
  // Sent-to-inbox OTP that also doubles as proof of email ownership on
  // sign-up, so a typo'd email blocks account activation. Enabled by
  // default for all new users; existing users get the column with the
  // same default.
  `alter table public.auth_users add column if not exists email_otp_enabled boolean not null default true`,
  `
  create table if not exists public.email_otp_codes (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    purpose text not null check (purpose in ('login','signup','enable_2fa')),
    code_hash text not null,
    expires_at timestamptz not null,
    attempts int not null default 0,
    used_at timestamptz,
    created_at timestamptz not null default now()
  )
  `,
  `create index if not exists idx_email_otp_user_purpose on public.email_otp_codes(user_id, purpose, created_at desc)`,
  `create index if not exists idx_email_otp_expires on public.email_otp_codes(expires_at)`,
  `
  create table if not exists public.user_onboarding_steps (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    organization_id uuid not null,
    step_name text not null,
    step_description text,
    completed boolean not null default false,
    completed_at timestamptz,
    metadata jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, step_name)
  )
  `,
  `create index if not exists idx_onboarding_steps_user on public.user_onboarding_steps(user_id, organization_id)`,
  `alter table public.profiles add column if not exists role text`,
  `alter table public.profiles add column if not exists department text`,
  `alter table public.profiles add column if not exists must_change_password boolean default false`,
  `alter table public.profiles add column if not exists password_reset_required boolean default false`,

  // Lifecycle columns the platform-admin approve/disable/delete endpoints
  // write to (see backend-node/src/routes/api/admin.ts). Without these the
  // updates fail with "column does not exist" and the endpoints 500.
  `alter table public.profiles add column if not exists status text not null default 'active'`,
  `alter table public.profiles add column if not exists approved_at timestamptz`,
  `alter table public.profiles add column if not exists approved_by uuid`,
  `alter table public.profiles add column if not exists disabled_at timestamptz`,
  `alter table public.profiles add column if not exists disabled_by uuid`,
  `alter table public.profiles add column if not exists disabled_reason text`,
  `alter table public.contracts add column if not exists content text`,
  `alter table public.contracts add column if not exists metadata jsonb`,
  `alter table public.cases add column if not exists custom_fields jsonb`,
  `alter table public.cases add column if not exists court text`,
  `alter table public.organizations add column if not exists status text default 'active'`,
  `alter table public.organizations add column if not exists is_active boolean default true`,
  `alter table public.documents add column if not exists contract_type text`,
  `alter table public.documents add column if not exists currency text`,
  `alter table public.documents add column if not exists effective_date date`,
  `alter table public.documents add column if not exists renewal_date date`,
  `alter table public.documents add column if not exists termination_date date`,
  `alter table public.documents add column if not exists value numeric`,
  `alter table public.documents add column if not exists terms text`,
  `alter table public.documents add column if not exists metadata jsonb`,
  `alter table public.documents add column if not exists file_size bigint`,

  // Soft-delete tombstone. The DELETE /api/v1/documents/:id route sets
  // this instead of hard-deleting the row, so an accidental delete is
  // recoverable for up to 30 days. The admin sweeper hard-deletes (and
  // unlinks the underlying Garage objects) anything past that window.
  // Indexed because every list query filters by `deleted_at is null`.
  `alter table public.documents add column if not exists deleted_at timestamptz`,
  `alter table public.document_versions add column if not exists deleted_at timestamptz`,
  `create index if not exists idx_documents_deleted_at on public.documents(deleted_at) where deleted_at is not null`,

  // SHA-256 of the stored bytes, captured at upload time. Used as a
  // tripwire on download — if the object we read back hashes to something
  // else, the bytes have been corrupted in storage or tampered with
  // out-of-band, and the read is refused. Hex string, 64 chars, NULL on
  // legacy rows that pre-date this column.
  `alter table public.documents add column if not exists sha256 text`,
  `alter table public.document_versions add column if not exists sha256 text`,

  // Storage status. 'present' (default) means file_path is expected to
  // resolve in the active storage driver. 'missing' is for legacy rows
  // whose bytes were never persisted (pre-Garage S3 cutover the backend
  // ran with no Railway volume mounted). Surfaced to the UI as
  // "Unavailable — please re-upload" instead of a generic 404. The
  // admin endpoint POST /api/v1/admin/storage/scan flips this column.
  `alter table public.documents add column if not exists storage_status text not null default 'present'`,
  `alter table public.document_versions add column if not exists storage_status text not null default 'present'`,
  `create index if not exists idx_documents_storage_status on public.documents(storage_status) where storage_status <> 'present'`,

  `create index if not exists idx_conversations_org on public.conversations(organization_id)`,
  `create index if not exists idx_participants_user on public.conversation_participants(user_id)`,
  `create index if not exists idx_messages_conversation_created on public.messages(conversation_id, created_at)`,
  `create index if not exists idx_ai_conversations_owner on public.ai_conversations(organization_id, user_id)`,
  `create index if not exists idx_ai_messages_conversation on public.ai_conversation_messages(conversation_id, created_at)`,
  `create index if not exists idx_admin_actions_created on public.admin_actions(created_at)`,

  // ── Billing / trial ───────────────────────────────────────────────
  // Plans get the extra metadata the frontend already reads (display_name,
  // description, features, plan_type, is_active). Subscriptions get the org
  // / user link, billing window, and trial fields the trial flow depends on.
  `alter table public.user_plans add column if not exists plan_type text`,
  `alter table public.user_plans add column if not exists display_name text`,
  `alter table public.user_plans add column if not exists description text`,
  `alter table public.user_plans add column if not exists features jsonb default '[]'::jsonb`,
  `alter table public.user_plans add column if not exists is_active boolean not null default true`,
  // Marketing presentation, admin-controlled. `highlight` drives the
  // "Most Popular" badge on the public pricing page; `sort_order` fixes the
  // display order. Nullable so the once-only backfill below never clobbers an
  // admin edit (e.g. turning the badge off stays off across redeploys).
  `alter table public.user_plans add column if not exists highlight boolean`,
  `alter table public.user_plans add column if not exists sort_order integer`,
  `update public.user_plans set highlight = (plan_type = 'professional') where highlight is null`,
  `update public.user_plans
      set sort_order = case plan_type
                         when 'starter' then 1
                         when 'professional' then 2
                         when 'enterprise' then 3
                         else 99
                       end
    where sort_order is null`,

  `alter table public.subscriptions add column if not exists organization_id uuid`,
  `alter table public.subscriptions add column if not exists user_id uuid`,
  `alter table public.subscriptions add column if not exists current_period_start timestamptz`,
  `alter table public.subscriptions add column if not exists current_period_end timestamptz`,
  `alter table public.subscriptions add column if not exists trial_ends_at timestamptz`,
  `alter table public.subscriptions add column if not exists cancel_at_period_end boolean not null default false`,
  `alter table public.subscriptions add column if not exists cancelled_at timestamptz`,
  `alter table public.subscriptions add column if not exists flutterwave_subscription_id text`,
  `alter table public.subscriptions add column if not exists flutterwave_customer_email text`,
  // Legacy NOT NULL from an earlier Flutterwave-only schema. Trial inserts
  // (bootstrap backfill, /billing/start-trial, requireActiveSubscription
  // lazy-grant) all create rows before a payment provider is involved.
  `alter table public.subscriptions alter column flutterwave_customer_email drop not null`,
  `alter table public.subscriptions alter column flutterwave_subscription_id drop not null`,
  // Bootstrap's trial backfill and the /billing/start-trial flow create
  // org-level subscriptions without a user_id. Legacy NOT NULL from when
  // subs were per-user only.
  `alter table public.subscriptions alter column user_id drop not null`,
  `create index if not exists idx_subscriptions_org_status on public.subscriptions(organization_id, status)`,
  // One active/trialing sub per org at a time.
  `create unique index if not exists uq_subscriptions_org_live
     on public.subscriptions(organization_id)
     where status in ('active','trialing','past_due')`,

  // Provider-neutral columns (we now use Paystack; the flutterwave_* columns
  // above remain for read-back but are no longer written). `provider` lets
  // future PSP swaps reuse the same row.
  `alter table public.subscriptions add column if not exists provider text`,
  `alter table public.subscriptions add column if not exists provider_customer_email text`,
  `alter table public.subscriptions add column if not exists provider_reference text`,

  // Seat-based billing: how many paid user seats this subscription covers.
  // amount charged = per-seat plan price × seats. Existing rows predate seats
  // and are treated as a single seat.
  `alter table public.subscriptions add column if not exists seats integer not null default 1`,
  `update public.subscriptions set seats = 1 where seats is null`,

  // ── Payment transactions ──────────────────────────────────────────
  // One row per checkout attempt, keyed by our own tx_ref (which we also
  // pass to Paystack as `reference`). Activation logic in the webhook /
  // verify-payment routes is idempotent off `status`.
  `
  create table if not exists public.payment_transactions (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    user_id uuid,
    subscription_id uuid,
    plan_id uuid,
    provider text not null default 'paystack',
    tx_ref text not null,
    provider_tx_id text,
    amount numeric not null,
    currency text not null default 'NGN',
    status text not null default 'pending',
    payment_type text not null default 'subscription',
    billing_interval text,
    customer_email text,
    metadata jsonb not null default '{}'::jsonb,
    raw_response jsonb,
    verified_at timestamptz,
    webhook_received_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
  `,
  // If the table already existed from a pre-Paystack schema (#172), the
  // CREATE TABLE IF NOT EXISTS above is a no-op and the new columns are
  // missing — backfill them all idempotently before the index/unique runs.
  `alter table public.payment_transactions add column if not exists user_id uuid`,
  `alter table public.payment_transactions add column if not exists subscription_id uuid`,
  `alter table public.payment_transactions add column if not exists plan_id uuid`,
  `alter table public.payment_transactions add column if not exists provider text not null default 'paystack'`,
  `alter table public.payment_transactions add column if not exists tx_ref text`,
  `alter table public.payment_transactions add column if not exists provider_tx_id text`,
  `alter table public.payment_transactions add column if not exists payment_type text not null default 'subscription'`,
  `alter table public.payment_transactions add column if not exists billing_interval text`,
  `alter table public.payment_transactions add column if not exists customer_email text`,
  `alter table public.payment_transactions add column if not exists metadata jsonb not null default '{}'::jsonb`,
  `alter table public.payment_transactions add column if not exists raw_response jsonb`,
  `alter table public.payment_transactions add column if not exists verified_at timestamptz`,
  `alter table public.payment_transactions add column if not exists webhook_received_at timestamptz`,
  // Seats this checkout pays for. For payment_type='subscription' it's the
  // total seat count; for 'seat_addon' it's the number of seats being added.
  `alter table public.payment_transactions add column if not exists seats integer`,
  // Drop NOT NULL on legacy flutterwave_* columns that may exist on the
  // pre-Paystack incarnation of this table. New code never writes to them;
  // without the drop, INSERTs from initiate-payment fail at the constraint.
  // DO blocks swallow `undefined_column` so fresh DBs (no legacy table) are
  // a no-op rather than an error.
  `do $$ begin alter table public.payment_transactions alter column flutterwave_tx_ref drop not null; exception when undefined_column then null; end $$`,
  `do $$ begin alter table public.payment_transactions alter column flutterwave_tx_id drop not null; exception when undefined_column then null; end $$`,
  `do $$ begin alter table public.payment_transactions alter column flutterwave_status drop not null; exception when undefined_column then null; end $$`,
  `do $$ begin alter table public.payment_transactions alter column flutterwave_charged_amount drop not null; exception when undefined_column then null; end $$`,
  `do $$ begin alter table public.payment_transactions alter column flutterwave_amount drop not null; exception when undefined_column then null; end $$`,
  `create unique index if not exists uq_payment_transactions_tx_ref on public.payment_transactions(tx_ref)`,
  `create index if not exists idx_payment_transactions_org_created on public.payment_transactions(organization_id, created_at desc)`,
  `create index if not exists idx_payment_transactions_status on public.payment_transactions(status)`,

  // Display vs charge split. When plans are priced in USD but Paystack
  // settles in NGN, `amount` / `currency` reflect what we actually
  // charged (NGN), and these columns preserve the original USD price +
  // the FX rate used so receipts / accounting can reconcile.
  `alter table public.payment_transactions add column if not exists display_currency text`,
  `alter table public.payment_transactions add column if not exists display_amount numeric`,
  `alter table public.payment_transactions add column if not exists fx_rate numeric`,
  `alter table public.payment_transactions add column if not exists fx_source text`,

  // Backfill plan_type before we dedupe / index on it. Rows that pre-date the
  // plan_type column inherit it from `name`.
  `update public.user_plans set plan_type = name where plan_type is null`,
  `update public.user_plans set display_name = initcap(name) where display_name is null`,

  // ── Dedupe user_plans by plan_type ────────────────────────────────
  // The previous seed used `on conflict do nothing` with no conflict target.
  // Without a unique constraint that's a no-op match, so every bootstrap run
  // inserted a fresh row per plan_type. Pick one keeper per plan_type (most
  // features, oldest as tiebreaker for determinism), re-point any subscriptions
  // pointing at doomed rows, then delete the duplicates.
  `with ranked as (
     select id, plan_type,
            row_number() over (
              partition by plan_type
              order by jsonb_array_length(coalesce(features, '[]'::jsonb)) desc,
                       created_at asc,
                       id asc
            ) as rn
     from public.user_plans
     where plan_type is not null
   ),
   keepers as (select id, plan_type from ranked where rn = 1),
   doomed as (select id, plan_type from ranked where rn > 1)
   update public.subscriptions s
      set plan_id = k.id
     from doomed d
     join keepers k on k.plan_type = d.plan_type
    where s.plan_id = d.id`,
  `with ranked as (
     select id, plan_type,
            row_number() over (
              partition by plan_type
              order by jsonb_array_length(coalesce(features, '[]'::jsonb)) desc,
                       created_at asc,
                       id asc
            ) as rn
     from public.user_plans
     where plan_type is not null
   )
   delete from public.user_plans
    where id in (select id from ranked where rn > 1)`,

  // One row per plan_type. The backfill above already populated plan_type
  // for legacy rows, so we can enforce NOT NULL + a regular (non-partial)
  // unique index. ON CONFLICT (plan_type) below requires a *non-partial*
  // unique constraint — Postgres won't match it against an index with a
  // WHERE predicate, which is why an earlier partial-index attempt left
  // the seed inserts failing with "no unique or exclusion constraint".
  `update public.user_plans set plan_type = coalesce(name, 'free') where plan_type is null`,
  `drop index if exists uq_user_plans_plan_type`,
  `alter table public.user_plans alter column plan_type set not null`,
  `create unique index if not exists uq_user_plans_plan_type
     on public.user_plans(plan_type)`,

  // The free tier no longer exists — users get a trial then choose a paid plan.
  // Deactivate any historical free row instead of deleting it so foreign-key
  // references from old subscriptions stay intact.
  `update public.user_plans set is_active = false, updated_at = now()
    where plan_type = 'free'`,

  // Seed the three canonical paid plans. Idempotent: re-runs overwrite
  // metadata but leave admin-edited prices alone (we only update non-price
  // fields).
  `insert into public.user_plans (name, plan_type, display_name, description, features, price_monthly, price_yearly, currency, is_active)
   values ('starter','starter','Starter','Everything a small team needs to run cases end-to-end.',
     '["Unlimited cases","Unlimited documents","AI document review","Email support"]'::jsonb,
     29, 290, 'USD', true)
   on conflict (plan_type) do update
     set name = excluded.name,
         display_name = excluded.display_name,
         description = excluded.description,
         features = excluded.features,
         is_active = true,
         updated_at = now()`,
  `insert into public.user_plans (name, plan_type, display_name, description, features, price_monthly, price_yearly, currency, is_active)
   values ('professional','professional','Professional','For growing firms that need automation and integrations.',
     '["Everything in Starter","Playbook automation","Tabular review","Priority support"]'::jsonb,
     79, 790, 'USD', true)
   on conflict (plan_type) do update
     set name = excluded.name,
         display_name = excluded.display_name,
         description = excluded.description,
         features = excluded.features,
         is_active = true,
         updated_at = now()`,
  `insert into public.user_plans (name, plan_type, display_name, description, features, price_monthly, price_yearly, currency, is_active)
   values ('enterprise','enterprise','Enterprise','Custom controls, SSO, and a dedicated success manager.',
     '["Everything in Professional","SSO / SAML","Custom data retention","Dedicated success manager"]'::jsonb,
     null, null, 'USD', true)
   on conflict (plan_type) do update
     set name = excluded.name,
         display_name = excluded.display_name,
         description = excluded.description,
         features = excluded.features,
         is_active = true,
         updated_at = now()`,

  // Backfill: every existing organization that has *never* had a subscription
  // row gets a 7-day Starter trial starting today. The "any historical sub"
  // check (rather than only the live ones) prevents this idempotent bootstrap
  // from re-granting a fresh trial to an org whose previous trial expired or
  // was cancelled. New orgs go through /billing/start-trial at signup time.
  `
  insert into public.subscriptions
    (organization_id, plan_id, status, billing_interval,
     current_period_start, current_period_end, trial_ends_at,
     created_at, updated_at)
  select
    o.id,
    (select id from public.user_plans
       where name = 'starter' and is_active = true
       order by created_at asc
       limit 1),
    'trialing',
    'monthly',
    now(),
    now() + interval '7 days',
    now() + interval '7 days',
    now(),
    now()
  from public.organizations o
  where not exists (
    select 1 from public.subscriptions s where s.organization_id = o.id
  )
  `,

  // ── Agent Infrastructure ──────────────────────────────────────────
  `
  create table if not exists public.agent_jobs (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    created_by uuid not null,
    agent_type text not null,
    status text not null default 'pending',
    priority int not null default 0,
    input jsonb not null default '{}',
    output jsonb,
    error text,
    progress int not null default 0,
    progress_message text,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
  `,
  `do $$ begin
     alter table public.agent_jobs add constraint fk_agent_jobs_org
       foreign key (organization_id) references public.organizations(id);
   exception when duplicate_object then null;
   end $$`,
  `create index if not exists idx_agent_jobs_org_status on public.agent_jobs(organization_id, status)`,
  `create index if not exists idx_agent_jobs_created on public.agent_jobs(created_at desc)`,
  `
  create table if not exists public.agent_job_steps (
    id uuid primary key default gen_random_uuid(),
    job_id uuid not null references public.agent_jobs(id) on delete cascade,
    step_name text not null,
    step_index int not null,
    status text not null default 'pending',
    input jsonb,
    output jsonb,
    error text,
    tokens_used int not null default 0,
    model_used text,
    duration_ms int,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz not null default now()
  )
  `,
  `create index if not exists idx_agent_job_steps_job on public.agent_job_steps(job_id, step_index)`,
  `
  create table if not exists public.agent_audit_logs (
    id uuid primary key default gen_random_uuid(),
    job_id uuid references public.agent_jobs(id) on delete set null,
    organization_id uuid not null,
    user_id uuid,
    action text not null,
    entity_type text,
    entity_id uuid,
    details jsonb,
    created_at timestamptz not null default now()
  )
  `,
  `create index if not exists idx_agent_audit_org on public.agent_audit_logs(organization_id, created_at desc)`,
  `create index if not exists idx_agent_audit_job on public.agent_audit_logs(job_id)`,
  `
  create table if not exists public.agent_configs (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null unique,
    matter_review_enabled boolean not null default true,
    max_concurrent_jobs int not null default 3,
    daily_token_budget int not null default 500000,
    llm_model_override text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
  `,

  // ── Monitoring Agents ─────────────────────────────────────────────
  `
  create table if not exists public.agent_monitors (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    monitor_type text not null,
    enabled boolean not null default true,
    config jsonb not null default '{}',
    last_run_at timestamptz,
    next_run_at timestamptz,
    run_interval_minutes int not null default 1440,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, monitor_type)
  )
  `,
  `create index if not exists idx_agent_monitors_org on public.agent_monitors(organization_id)`,
  `create index if not exists idx_agent_monitors_next_run on public.agent_monitors(next_run_at) where enabled = true`,
  `
  create table if not exists public.agent_alerts (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    monitor_id uuid references public.agent_monitors(id) on delete set null,
    alert_type text not null,
    severity text not null default 'info',
    title text not null,
    description text,
    entity_type text,
    entity_id uuid,
    metadata jsonb,
    status text not null default 'active',
    acknowledged_by uuid,
    acknowledged_at timestamptz,
    resolved_at timestamptz,
    created_at timestamptz not null default now()
  )
  `,
  `create index if not exists idx_agent_alerts_org_status on public.agent_alerts(organization_id, status)`,
  `create index if not exists idx_agent_alerts_entity on public.agent_alerts(entity_type, entity_id)`,

  // ── Approval Workflows ────────────────────────────────────────────
  `
  create table if not exists public.agent_approval_requests (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    job_id uuid references public.agent_jobs(id) on delete set null,
    alert_id uuid references public.agent_alerts(id) on delete set null,
    requested_by_agent text not null,
    action_type text not null,
    action_payload jsonb not null,
    summary text not null,
    confidence numeric(3,2),
    status text not null default 'pending',
    reviewed_by uuid,
    reviewed_at timestamptz,
    review_notes text,
    expires_at timestamptz,
    executed_at timestamptz,
    execution_result jsonb,
    created_at timestamptz not null default now()
  )
  `,
  `create index if not exists idx_agent_approvals_org_status on public.agent_approval_requests(organization_id, status)`,
  `create index if not exists idx_agent_approvals_expires on public.agent_approval_requests(expires_at) where status = 'pending'`,
  `
  create table if not exists public.agent_confidence_thresholds (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    action_type text not null,
    auto_approve_threshold numeric(3,2) not null default 0.95,
    require_approval_threshold numeric(3,2) not null default 0.70,
    reject_threshold numeric(3,2) not null default 0.30,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, action_type)
  )
  `,

  // ── Contract Negotiation ──────────────────────────────────────────
  `
  create table if not exists public.negotiation_playbooks (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    name text not null,
    description text,
    contract_types text[],
    rules jsonb not null default '[]',
    escalation_config jsonb,
    is_default boolean not null default false,
    created_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
  `,
  `create index if not exists idx_playbooks_org on public.negotiation_playbooks(organization_id)`,
  `
  create table if not exists public.negotiations (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    contract_id uuid not null,
    playbook_id uuid references public.negotiation_playbooks(id) on delete set null,
    counterparty_name text,
    status text not null default 'active',
    current_round int not null default 0,
    our_last_position jsonb,
    their_last_position jsonb,
    started_by uuid not null,
    assigned_to uuid,
    escalated_to uuid,
    escalated_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
  `,
  `create index if not exists idx_negotiations_org on public.negotiations(organization_id, status)`,
  `create index if not exists idx_negotiations_contract on public.negotiations(contract_id)`,
  `
  create table if not exists public.negotiation_turns (
    id uuid primary key default gen_random_uuid(),
    negotiation_id uuid not null references public.negotiations(id) on delete cascade,
    round_number int not null,
    direction text not null,
    content text,
    changes jsonb,
    ai_analysis jsonb,
    ai_confidence numeric(3,2),
    approval_id uuid references public.agent_approval_requests(id) on delete set null,
    created_by uuid,
    created_at timestamptz not null default now()
  )
  `,
  `create index if not exists idx_negotiation_turns on public.negotiation_turns(negotiation_id, round_number)`,
  `
  create table if not exists public.negotiation_positions (
    id uuid primary key default gen_random_uuid(),
    negotiation_id uuid not null references public.negotiations(id) on delete cascade,
    clause_name text not null,
    our_position text,
    their_position text,
    status text not null default 'open',
    rounds_discussed int not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (negotiation_id, clause_name)
  )
  `,
  `create index if not exists idx_negotiation_positions on public.negotiation_positions(negotiation_id)`,

  // ── Intelligence Dashboard ────────────────────────────────────────
  `
  create table if not exists public.intelligence_snapshots (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    snapshot_type text not null default 'ad_hoc',
    data jsonb not null default '{}',
    generated_by_job_id uuid references public.agent_jobs(id) on delete set null,
    created_at timestamptz not null default now()
  )
  `,
  `create index if not exists idx_intel_snapshots_org on public.intelligence_snapshots(organization_id, created_at desc)`,
  `
  create table if not exists public.intelligence_recommendations (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    snapshot_id uuid references public.intelligence_snapshots(id) on delete cascade,
    category text not null,
    priority text not null default 'medium',
    title text not null,
    description text not null,
    entity_type text,
    entity_id uuid,
    action_url text,
    status text not null default 'active',
    dismissed_by uuid,
    created_at timestamptz not null default now()
  )
  `,
  `create index if not exists idx_intel_recs_org on public.intelligence_recommendations(organization_id, status)`,

  // ── Playbook prompt templates ─────────────────────────────────────
  // Distinct from negotiation_playbooks above (which carries rules /
  // escalation config). These are free-text AI prompt templates used by
  // the assistant chat and the tabular review engine. System templates
  // have organization_id = null and is_system = true; org templates own
  // an organization_id.
  `
  create table if not exists public.playbook_templates (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid references public.organizations(id) on delete cascade,
    created_by      uuid,
    is_system       boolean not null default false,
    slug            text unique,
    title           text not null,
    description     text,
    kind            text not null default 'assistant'
                    check (kind in ('assistant', 'tabular')),
    prompt_md       text not null,
    columns_config  jsonb,
    practice        text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint playbook_templates_org_or_system check (
      (is_system = true and organization_id is null)
      or (is_system = false and organization_id is not null)
    )
  )
  `,
  `create index if not exists idx_playbook_templates_org on public.playbook_templates(organization_id)`,
  `create index if not exists idx_playbook_templates_kind on public.playbook_templates(kind)`,

  // ── Document versions ─────────────────────────────────────────────
  `
  create table if not exists public.document_versions (
    id                uuid primary key default gen_random_uuid(),
    document_id       uuid not null references public.documents(id) on delete cascade,
    organization_id   uuid not null references public.organizations(id) on delete cascade,
    version_number    integer not null,
    source            text not null default 'upload'
                      check (source in ('upload','assistant_edit','user_accept','user_reject','generated')),
    storage_path      text not null,
    pdf_storage_path  text,
    display_name      text,
    size_bytes        bigint,
    mime_type         text,
    created_by        uuid,
    created_at        timestamptz not null default now(),
    unique (document_id, version_number)
  )
  `,
  `create index if not exists idx_document_versions_document on public.document_versions(document_id)`,
  `create index if not exists idx_document_versions_org on public.document_versions(organization_id)`,
  `alter table public.documents add column if not exists current_version_id uuid references public.document_versions(id)`,
  `create index if not exists idx_documents_current_version on public.documents(current_version_id)`,

  // ── DOCX tracked-change edits ─────────────────────────────────────
  `
  create table if not exists public.document_edits (
    id              uuid primary key default gen_random_uuid(),
    document_id     uuid not null references public.documents(id) on delete cascade,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    version_id      uuid references public.document_versions(id) on delete set null,
    ins_w_id        text,
    del_w_id        text,
    deleted_text    text,
    inserted_text   text,
    context_before  text,
    context_after   text,
    reason          text,
    status          text not null default 'pending'
                    check (status in ('pending','accepted','rejected')),
    created_by      uuid,
    created_at      timestamptz not null default now(),
    resolved_at     timestamptz,
    resolved_by     uuid
  )
  `,
  `create index if not exists idx_document_edits_document on public.document_edits(document_id)`,
  `create index if not exists idx_document_edits_status on public.document_edits(status)`,
  `create index if not exists idx_document_edits_version on public.document_edits(version_id)`,

  // ── Tabular review ────────────────────────────────────────────────
  `
  create table if not exists public.tabular_reviews (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    case_id         uuid references public.cases(id) on delete set null,
    template_id     uuid references public.playbook_templates(id) on delete set null,
    title           text not null,
    practice        text,
    columns_config  jsonb not null default '[]'::jsonb,
    document_ids    uuid[] not null default '{}',
    created_by      uuid,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
  )
  `,
  `create index if not exists idx_tabular_reviews_org on public.tabular_reviews(organization_id)`,
  `create index if not exists idx_tabular_reviews_case on public.tabular_reviews(case_id)`,
  `
  create table if not exists public.tabular_cells (
    id            uuid primary key default gen_random_uuid(),
    review_id     uuid not null references public.tabular_reviews(id) on delete cascade,
    document_id   uuid not null references public.documents(id) on delete cascade,
    column_index  integer not null,
    content       jsonb,
    status        text not null default 'pending'
                  check (status in ('pending','generating','done','error')),
    error_message text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    unique (review_id, document_id, column_index)
  )
  `,
  `create index if not exists idx_tabular_cells_review on public.tabular_cells(review_id)`,
  `create index if not exists idx_tabular_cells_status on public.tabular_cells(status)`,
  `
  create table if not exists public.tabular_review_chats (
    id          uuid primary key default gen_random_uuid(),
    review_id   uuid not null references public.tabular_reviews(id) on delete cascade,
    user_id     uuid,
    title       text,
    created_at  timestamptz not null default now()
  )
  `,
  `
  create table if not exists public.tabular_review_chat_messages (
    id           uuid primary key default gen_random_uuid(),
    chat_id      uuid not null references public.tabular_review_chats(id) on delete cascade,
    role         text not null check (role in ('user','assistant','system','tool')),
    content      text,
    tool_calls   jsonb,
    created_at   timestamptz not null default now()
  )
  `,

  // ── Backfill: legacy documents.file_path → document_versions v1 ──
  // Documents created before versioning landed have a file_path but no
  // matching document_versions row. This idempotent backfill creates a
  // v1 (source='upload') for each such document and points
  // documents.current_version_id at it. Safe to re-run; the WHERE clause
  // skips documents that already have a version.
  `
  insert into public.document_versions
    (document_id, organization_id, version_number, source, storage_path,
     mime_type, size_bytes, display_name, created_by, created_at)
  select
    d.id,
    d.organization_id,
    1,
    'upload',
    d.file_path,
    d.mime_type,
    d.file_size,
    'Original upload',
    d.created_by,
    coalesce(d.created_at, now())
  from public.documents d
  where d.file_path is not null
    and d.organization_id is not null
    and not exists (
      select 1 from public.document_versions v where v.document_id = d.id
    )
  `,
  `
  update public.documents d
     set current_version_id = v.id
    from public.document_versions v
   where v.document_id = d.id
     and v.version_number = 1
     and d.current_version_id is null
  `,

  // ── Seed built-in playbook prompt templates ───────────────────────
  `insert into public.playbook_templates
     (is_system, slug, title, description, kind, prompt_md, practice)
   values (
     true, 'builtin-cp-checklist',
     'Generate Conditions Precedent Checklist',
     'Reviews a credit/financing agreement and produces a downloadable CP checklist (.docx, landscape) grouped by category.',
     'assistant',
     E'## Generate Conditions Precedent Checklist\n\nReview the uploaded credit agreement or financing document and generate a comprehensive Conditions Precedent (CP) checklist.\n\nYou MUST use the generate_docx tool to produce the checklist as a downloadable Word document. You MUST pass landscape: true to the generate_docx tool — the document must be in landscape orientation. Do not display the checklist inline — generate the .docx file and provide the download link.\n\nStructure the document as follows:\n- For each category of conditions (e.g. Corporate, Financial, Legal, Security), add a section with a heading\n- Under each category heading, include a table with exactly these four columns in this order:\n  1. Index — sequential number within the category (1, 2, 3…)\n  2. Clause Number — the clause or schedule reference from the agreement\n  3. Clause — a concise description of the condition precedent\n  4. Status — leave blank (empty string) for the user to fill in\n\nUse the table field in the section object (not content) for each category''s rows.\n\nBefore finalizing, double-check that every table is formatted correctly: each table must have exactly the four columns above in the same order, headers must match exactly (Index, Clause Number, Clause, Status), every row must have the same number of cells as the headers, the Index column must be sequential starting from 1 within each category, and no cells should contain stray markdown, newlines, or placeholder text (use an empty string for Status).',
     'Banking & Finance'
   )
   on conflict (slug) do update set
     title       = excluded.title,
     description = excluded.description,
     prompt_md   = excluded.prompt_md,
     practice    = excluded.practice,
     updated_at  = now()`,
  `insert into public.playbook_templates
     (is_system, slug, title, description, kind, prompt_md, practice)
   values (
     true, 'builtin-credit-summary',
     'Credit Agreement Summary',
     'Produces a 21-point legal summary of a credit agreement, flagging unusual or non-market terms.',
     'assistant',
     E'## Credit Agreement Summary\n\nReview the uploaded credit agreement and produce a comprehensive legal summary covering the following topics. For each section, identify the key provisions, quote the relevant clause or schedule references, and flag any unusual, onerous, or non-market terms.\n\n1. **Lenders** — All lenders or members of the lender syndicate, including their full legal name and role (e.g. mandated lead arranger, original lender, agent bank)\n2. **Borrowers** — All borrowers, including their full legal name and jurisdiction of incorporation\n3. **Guarantors** — All guarantors, including their full legal name and the scope of their guarantee obligation\n4. **Other Parties** — Any other material parties (e.g. facility agent, security agent, hedge counterparties, issuing bank) and their roles\n5. **Date of Agreement** — Date of the credit agreement\n6. **Facilities** — Each facility available (e.g. Revolving Credit Facility, Term Loan A, Term Loan B, Term Loan C), the facility type, tranche name, and any key structural features\n7. **Amount** — Total committed amount across all facilities, the currency, and breakdown by tranche if applicable\n8. **Purpose** — Stated purpose for which borrowings may be used and any restrictions on use of proceeds\n9. **Interest** — Applicable reference rate (e.g. SOFR, EURIBOR, base rate), the margin, any margin ratchet mechanism, and how interest periods are structured\n10. **Commitment Fee** — Commitment or utilisation fees, the applicable rate, how they are calculated, and the basis (e.g. undrawn commitment, average utilisation)\n11. **Repayment Schedule** — Repayment profile for each facility, whether by scheduled instalments or bullet repayment, and the repayment dates and amounts\n12. **Maturity** — Final maturity date for each facility\n13. **Security** — Each class of security granted or required (e.g. share pledges, fixed and floating charges, real estate mortgages, account pledges) and the assets or entities over which security is taken\n14. **Guarantees** — Guarantee obligations, the guarantors, the scope of the guarantee, and any limitations (e.g. up-stream guarantee limitations, guarantor coverage test)\n15. **Financial Covenants** — Each financial covenant, the metric (e.g. leverage ratio, interest cover, cashflow cover), the applicable test, testing frequency, and any equity cure rights\n16. **Events of Default** — Each event of default, noting any grace periods, materiality thresholds, or cross-default provisions\n17. **Assignment** — Restrictions or permissions on assignment or transfer (e.g. white/blacklists, borrower consent for lender transfers; restrictions on borrower assignment)\n18. **Change of Control** — What constitutes a change of control, what obligations it triggers (e.g. mandatory prepayment, cancellation, lender consent), and any cure period\n19. **Prepayment Fee** — Any prepayment fees, make-whole premiums, or soft-call protections, the applicable fee, the period during which it applies, and any exceptions (e.g. prepayment from insurance proceeds or asset disposals)\n20. **Governing Law** — Governing law of the agreement\n21. **Dispute Resolution** — Whether disputes go to litigation or arbitration, the chosen forum or seat, and any submission to jurisdiction provisions\n\nDeliver the summary inline in your chat response — do NOT call generate_docx. Only produce a downloadable Word document if the user explicitly asks for one.',
     'Banking & Finance'
   )
   on conflict (slug) do update set
     title       = excluded.title,
     description = excluded.description,
     prompt_md   = excluded.prompt_md,
     practice    = excluded.practice,
     updated_at  = now()`,
  `insert into public.playbook_templates
     (is_system, slug, title, description, kind, prompt_md, practice)
   values (
     true, 'builtin-sha-summary',
     'Shareholder Agreement Summary',
     'Produces a 15-point legal summary of a shareholder agreement, flagging unusual provisions.',
     'assistant',
     E'## Shareholder Agreement Summary\n\nReview the uploaded shareholder agreement and produce a comprehensive legal summary covering the following topics. For each section, identify the key provisions, quote the relevant clause references, and flag any unusual, onerous, or market-standard deviations.\n\n1. **Parties & Shareholdings** — Full legal names, roles, share classes held, and percentage interests (on a fully diluted basis if stated)\n2. **Share Classes & Rights** — For each class: voting rights, dividend rights, liquidation preference, conversion or redemption features\n3. **Board Composition & Governance** — Board size, director appointment rights (and the shareholding thresholds required to maintain them), quorum, and casting vote\n4. **Reserved Matters** — Decisions requiring a special majority, unanimity, or a specific shareholder''s consent; note the threshold and whose consent is required for each\n5. **Pre-emption on New Shares** — Who holds pre-emption rights, procedure, timeline, and any carve-outs (e.g. employee option schemes)\n6. **Transfer Restrictions** — Lock-up periods, prohibited transfers, permitted transfers (e.g. to affiliates), and any board or shareholder approval requirements\n7. **Right of First Refusal / Pre-emption on Transfer** — Trigger, procedure, pricing mechanics, and any exceptions\n8. **Drag-Along Rights** — Who holds the right, threshold to trigger, conditions (e.g. minimum price, independent valuation), and minority protections\n9. **Tag-Along Rights** — Who holds the right, triggering threshold, exercise procedure, and price terms\n10. **Anti-Dilution Protections** — Type (full ratchet, weighted average), trigger events, calculation mechanics, and exceptions\n11. **Dividend Policy** — Any obligation or target to pay dividends, preferential dividend rights, and restrictions on distributions\n12. **Exit & Liquidity** — Agreed exit routes (trade sale, IPO, drag sale), timelines, and liquidation preferences on exit\n13. **Deadlock** — Deadlock definition, escalation and resolution mechanisms (e.g. Russian roulette, put/call options), and consequences if unresolved\n14. **Non-Compete & Non-Solicitation** — Who is bound, scope of activities and geography, duration, and carve-outs\n15. **Governing Law & Dispute Resolution** — Applicable law, forum, arbitration or litigation, and any mandatory escalation steps\n\nGenerate the summary as a downloadable Word document.',
     'Corporate / M&A'
   )
   on conflict (slug) do update set
     title       = excluded.title,
     description = excluded.description,
     prompt_md   = excluded.prompt_md,
     practice    = excluded.practice,
     updated_at  = now()`,

  // ── Client Portal ─────────────────────────────────────────────────
  // Client-facing case visibility + proactive updates. See
  // docs/client-portal-SPEC.md. A client_user is a GLOBAL identity (one
  // login across many firms) — deliberately NOT scoped to an organization.
  // Authorization to see a matter lives in client_case_access; that grant
  // carries organization_id so every matter is labeled with its firm and two
  // firms' data never overlap. Gated to Professional+ via the 'client_portal'
  // feature key (enforced in the routes, not here).
  `
  create table if not exists public.client_users (
    id uuid primary key default gen_random_uuid(),
    email text not null,
    encrypted_password text,
    full_name text,
    phone text,
    is_active boolean not null default true,
    email_verified_at timestamptz,
    last_sign_in_at timestamptz,
    refresh_token text,
    refresh_token_expires_at timestamptz,
    invite_token text,
    invite_expires_at timestamptz,
    password_reset_token text,
    password_reset_expires_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
  `,
  `create unique index if not exists idx_client_users_email_lower on public.client_users (lower(email))`,
  `create index if not exists idx_client_users_invite_token on public.client_users(invite_token) where invite_token is not null`,
  `create index if not exists idx_client_users_reset_token on public.client_users(password_reset_token) where password_reset_token is not null`,

  // Link a firm's per-org contact record to the global identity. One
  // client_user ↔ many clients rows (one per firm). portal_enabled gates
  // whether this firm has switched the portal on for this contact.
  `alter table public.clients add column if not exists client_user_id uuid references public.client_users(id)`,
  `alter table public.clients add column if not exists portal_enabled boolean not null default false`,
  `create index if not exists idx_clients_client_user on public.clients(client_user_id)`,

  // Authorization spine. Deny-by-default: a client_user sees a case ONLY if
  // an active row exists here. organization_id is denormalized for fast
  // filtering + firm labeling in the portal.
  `
  create table if not exists public.client_case_access (
    id uuid primary key default gen_random_uuid(),
    client_user_id uuid not null references public.client_users(id) on delete cascade,
    case_id uuid not null references public.cases(id) on delete cascade,
    organization_id uuid not null,
    client_id uuid,
    role text not null default 'viewer' check (role in ('viewer','collaborator')),
    status text not null default 'active' check (status in ('active','revoked')),
    granted_by uuid,
    created_at timestamptz not null default now(),
    revoked_at timestamptz,
    unique (client_user_id, case_id)
  )
  `,
  `create index if not exists idx_ccaccess_client on public.client_case_access(client_user_id, status)`,
  `create index if not exists idx_ccaccess_case on public.client_case_access(case_id)`,
  `create index if not exists idx_ccaccess_org on public.client_case_access(organization_id)`,

  // Append-only case timeline. Every meaningful action writes one row. The
  // portal reads ONLY rows where client_visible = true.
  `
  create table if not exists public.case_events (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    case_id uuid not null references public.cases(id) on delete cascade,
    event_type text not null,
    title text,
    body text,
    payload jsonb not null default '{}'::jsonb,
    actor_type text not null default 'staff' check (actor_type in ('staff','client','system','agent')),
    actor_id uuid,
    client_visible boolean not null default false,
    notified_at timestamptz,
    occurred_at timestamptz not null default now(),
    created_at timestamptz not null default now()
  )
  `,
  `create index if not exists idx_case_events_case on public.case_events(case_id, occurred_at desc)`,
  `create index if not exists idx_case_events_org on public.case_events(organization_id, occurred_at desc)`,
  `create index if not exists idx_case_events_digest on public.case_events(case_id) where client_visible = true and notified_at is null`,

  // Two-way per-case client↔firm thread. Distinct from the staff-only
  // conversations/messages tables.
  `
  create table if not exists public.case_client_messages (
    id uuid primary key default gen_random_uuid(),
    case_id uuid not null references public.cases(id) on delete cascade,
    organization_id uuid not null,
    sender_type text not null check (sender_type in ('staff','client')),
    sender_id uuid not null,
    body text not null,
    read_at timestamptz,
    created_at timestamptz not null default now()
  )
  `,
  `create index if not exists idx_case_client_messages_case on public.case_client_messages(case_id, created_at)`,

  // Audit of generated / sent client updates. Draft → approved → sent.
  `
  create table if not exists public.client_update_digests (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    case_id uuid not null references public.cases(id) on delete cascade,
    client_user_id uuid references public.client_users(id) on delete set null,
    status text not null default 'draft' check (status in ('draft','approved','sent','failed')),
    channel text not null default 'email',
    subject text,
    body_md text,
    event_ids uuid[] not null default '{}',
    generated_by_job_id uuid,
    approved_by uuid,
    approved_at timestamptz,
    sent_at timestamptz,
    error text,
    created_at timestamptz not null default now()
  )
  `,
  `create index if not exists idx_client_digests_case on public.client_update_digests(case_id, created_at desc)`,
  `create index if not exists idx_client_digests_status on public.client_update_digests(organization_id, status)`,

  // Firm-curated plain-English "what's happening" blurb shown to the client.
  `alter table public.cases add column if not exists client_summary text`,

  // Client portal email-OTP second factor. On by default (mirrors staff
  // email OTP). Stored in a dedicated table so client and staff OTP code
  // spaces never share rows. `user_id` here is a client_users.id.
  `alter table public.client_users add column if not exists otp_enabled boolean not null default true`,
  `
  create table if not exists public.client_email_otp_codes (
    id uuid primary key default gen_random_uuid(),
    client_user_id uuid not null references public.client_users(id) on delete cascade,
    purpose text not null default 'login' check (purpose in ('login')),
    code_hash text not null,
    expires_at timestamptz not null,
    attempts int not null default 0,
    used_at timestamptz,
    created_at timestamptz not null default now()
  )
  `,
  `create index if not exists idx_client_otp_user on public.client_email_otp_codes(client_user_id, purpose, created_at desc)`,
  `create index if not exists idx_client_otp_expires on public.client_email_otp_codes(expires_at)`,

  // Documents shared to the client portal. A document becomes visible to the
  // client only when staff explicitly share it (sets client_visible=true and
  // emits a document_shared case_event). The case link lives in
  // metadata->>'case_id' (this codebase has no documents.case_id column).
  `alter table public.documents add column if not exists client_visible boolean not null default false`,
  `create index if not exists idx_documents_client_visible on public.documents(client_visible) where client_visible = true`,

  // Calendar exposure to clients. calendar_events already carries case_id /
  // client_id (set by the staff calendar). Ensure the table + the columns the
  // portal reads exist, and add client_visible so a matter-linked event (e.g.
  // a court hearing) shows in the client's portal by default while staff can
  // hide internal items. create-if-not-exists is a no-op where the table
  // already exists from the legacy schema.
  `
  create table if not exists public.calendar_events (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    created_by uuid,
    title text not null,
    description text,
    start_date timestamptz,
    end_date timestamptz,
    location text,
    attendees jsonb,
    event_type text,
    case_id uuid,
    client_id uuid,
    is_recurring boolean default false,
    recurrence_pattern jsonb,
    recurrence_end_date timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
  `,
  `alter table public.calendar_events add column if not exists case_id uuid`,
  `alter table public.calendar_events add column if not exists client_id uuid`,
  `alter table public.calendar_events add column if not exists client_visible boolean not null default true`,
  `create index if not exists idx_calendar_events_case on public.calendar_events(case_id) where case_id is not null`,
  `create index if not exists idx_calendar_events_org on public.calendar_events(organization_id, start_date)`,

  // ── Client portal: CLIENT-LEVEL access (the primary spine) ────────────
  // When a firm enables the portal for a client, the linked client_user gets
  // access to ALL that client's matters (current + future) via a row here,
  // keyed on the firm's clients.id. A matter can opt OUT with
  // cases.portal_private = true. The older per-matter client_case_access
  // table remains as a SECONDARY, explicit grant path (e.g. giving a
  // non-client third party access to a single matter); an explicit grant
  // overrides portal_private. Client-invited teammates also get rows here
  // (granted_by_type='client') so a client's colleagues see the same matters.
  `
  create table if not exists public.client_portal_access (
    id uuid primary key default gen_random_uuid(),
    client_user_id uuid not null references public.client_users(id) on delete cascade,
    client_id uuid not null,
    organization_id uuid not null,
    role text not null default 'viewer' check (role in ('viewer','collaborator')),
    status text not null default 'active' check (status in ('active','revoked')),
    granted_by uuid,
    granted_by_type text not null default 'staff' check (granted_by_type in ('staff','client')),
    created_at timestamptz not null default now(),
    revoked_at timestamptz,
    unique (client_user_id, client_id)
  )
  `,
  `create index if not exists idx_cpa_user on public.client_portal_access(client_user_id, status)`,
  `create index if not exists idx_cpa_client on public.client_portal_access(client_id)`,
  `create index if not exists idx_cpa_org on public.client_portal_access(organization_id)`,

  // Per-matter privacy escape hatch: exclude a sensitive matter from the
  // client's portal even though they have client-level access. Default false
  // (matters are visible to their client by default — the chosen model).
  `alter table public.cases add column if not exists portal_private boolean not null default false`,

  // Firm-enforced client 2FA. Because client_users is a GLOBAL identity,
  // OTP is forced at login when ANY firm the client has active access to has
  // this set — that's the only coherent rule for a shared login. Default
  // false (the per-client client_users.otp_enabled default-true already keeps
  // OTP on out of the box; this lets a firm HARD-require it).
  `alter table public.organizations add column if not exists portal_require_otp boolean not null default false`,

  // Client RSVP to a matter calendar event (e.g. a court hearing). One row per
  // (event, client_user). Surfaced back to the client + emitted to the matter
  // timeline so staff see responses without a separate calendar UI.
  `
  create table if not exists public.calendar_event_rsvps (
    id uuid primary key default gen_random_uuid(),
    calendar_event_id uuid not null references public.calendar_events(id) on delete cascade,
    client_user_id uuid not null references public.client_users(id) on delete cascade,
    response text not null check (response in ('accepted','declined','tentative')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (calendar_event_id, client_user_id)
  )
  `,
  `create index if not exists idx_calendar_rsvps_event on public.calendar_event_rsvps(calendar_event_id)`,
  `create index if not exists idx_calendar_rsvps_client on public.calendar_event_rsvps(client_user_id)`,

  `
  insert into public.organizations (id, name, email)
  values ('00000000-0000-0000-0000-000000000001', 'Kourti Local Dev Org', 'dev@kourti.local')
  on conflict (id) do nothing
  `,
  `
  insert into public.profiles (user_id, organization_id, email, first_name, last_name)
  values (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'dev@kourti.local',
    'Dev',
    'User'
  )
  on conflict (user_id) do nothing
  `,
  `
  insert into public.auth_users (id, email, encrypted_password, is_active, email_confirmed_at)
  values (
    '00000000-0000-0000-0000-000000000001',
    'dev@kourti.local',
    '$2b$12$/8EAYMwovKMeiAFPEhQ4geMawJ.EbVzwsPaMTGa7VIMkHFoV7Uwya',
    true,
    now()
  )
  on conflict (id) do nothing
  `,
  `do $$ begin
    insert into public.user_role_assignments (user_id, role_name, organization_id)
    values (
      '00000000-0000-0000-0000-000000000001',
      'superadmin',
      '00000000-0000-0000-0000-000000000001'
    );
    exception when unique_violation then null;
   end $$`,

  // ── Plan feature entitlements ─────────────────────────────────────
  // Source of truth for feature-gating (plan_type → feature_key). Seeded from
  // the code default matrix; admin-editable thereafter. Absence of a row (or
  // enabled=false) means the plan does NOT include that feature.
  `
  create table if not exists public.plan_features (
    plan_type text not null,
    feature_key text not null,
    enabled boolean not null default true,
    updated_at timestamptz not null default now(),
    primary key (plan_type, feature_key)
  )
  `,
  `insert into public.plan_features (plan_type, feature_key, enabled)
   values ${planFeatureSeedValues}
   on conflict (plan_type, feature_key) do nothing`,

  // ── Plan usage limits (tiered caps) ───────────────────────────────
  // Source of truth for numeric caps (plan_type → limit_key → value). Seeded
  // from DEFAULT_PLAN_LIMITS; admin-editable thereafter. A missing row (or null
  // value) means UNLIMITED for that key. See services/limits.ts.
  `
  create table if not exists public.plan_limits (
    plan_type text not null,
    limit_key text not null,
    limit_value bigint,
    updated_at timestamptz not null default now(),
    primary key (plan_type, limit_key)
  )
  `,
  `insert into public.plan_limits (plan_type, limit_key, limit_value)
   values ${planLimitSeedValues}
   on conflict (plan_type, limit_key) do nothing`,

  // ── Marketing lead capture ────────────────────────────────────────
  // Public contact-form and assessment submissions from the marketing site
  // (kourti.com). Written by the unauthenticated /api/v1/public/* endpoints.
  // `metadata` holds structured extras (e.g. assessment scores); `source`
  // distinguishes the entry point ('contact' | 'assessment' | 'report').
  `
  create table if not exists public.contact_submissions (
    id          uuid primary key default gen_random_uuid(),
    first_name  text not null,
    last_name   text not null,
    email       text not null,
    company     text,
    phone       text,
    firm_size   text,
    interest    text not null,
    message     text not null,
    source      text not null default 'contact',
    metadata    jsonb not null default '{}'::jsonb,
    status      text not null default 'new'
                check (status in ('new','in_progress','resolved')),
    created_at  timestamptz not null default now()
  )
  `,
  `create index if not exists idx_contact_submissions_email on public.contact_submissions(email)`,
  `create index if not exists idx_contact_submissions_created_at on public.contact_submissions(created_at desc)`,
];

export async function ensureDatabaseSchema() {
  // Bootstrap uses idempotent DDL (CREATE IF NOT EXISTS, ADD COLUMN IF
  // NOT EXISTS) so it is safe to run on every boot — including production.
  // Previously gated behind RUN_BOOTSTRAP=1 in prod, but that caused 500s
  // when new columns were deployed without running the migration first.

  console.log('Running database bootstrap...');
  for (const statement of bootstrapStatements) {
    try {
      await db.query(statement);
    } catch (err) {
      // Log but don't fail -- table may already exist with different constraints.
      // We deliberately include a preview of the failing statement so a
      // partially-applied schema doesn't fail silently at runtime.
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('already exists')) {
        const preview = statement.replace(/\s+/g, ' ').trim().substring(0, 200);
        console.warn(
          `Bootstrap statement warning: ${msg.substring(0, 200)}\n  statement: ${preview}`
        );
      }
    }
  }
  console.log('Database bootstrap complete');
}
