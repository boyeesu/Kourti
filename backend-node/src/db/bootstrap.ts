import { db } from './pool.js';

const bootstrapStatements = [
  `create extension if not exists pgcrypto`,
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
