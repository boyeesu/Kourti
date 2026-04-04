import { db } from './pool.js';

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
  `create index if not exists idx_conversations_org on public.conversations(organization_id)`,
  `create index if not exists idx_participants_user on public.conversation_participants(user_id)`,
  `create index if not exists idx_messages_conversation_created on public.messages(conversation_id, created_at)`,
  `create index if not exists idx_ai_conversations_owner on public.ai_conversations(organization_id, user_id)`,
  `create index if not exists idx_ai_messages_conversation on public.ai_conversation_messages(conversation_id, created_at)`,
  `create index if not exists idx_admin_actions_created on public.admin_actions(created_at)`,

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
];

export async function ensureDatabaseSchema() {
  // In production, the database schema is managed by Supabase migrations.
  // Bootstrap is only needed for local Docker dev where we start from scratch.
  if (process.env.NODE_ENV === 'production' && !process.env.RUN_BOOTSTRAP) {
    console.log('Skipping bootstrap in production (set RUN_BOOTSTRAP=1 to force)');
    // Still verify DB connectivity
    await db.query('select 1');
    console.log('Database connection verified');
    return;
  }

  console.log('Running database bootstrap...');
  for (const statement of bootstrapStatements) {
    try {
      await db.query(statement);
    } catch (err) {
      // Log but don't fail -- table may already exist with different constraints
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('already exists')) {
        console.warn('Bootstrap statement warning:', msg.substring(0, 120));
      }
    }
  }
  console.log('Database bootstrap complete');
}
