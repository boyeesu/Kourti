create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null,
  organization_id uuid not null,
  email text,
  first_name text,
  last_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  email text,
  phone text,
  company text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
);

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
);

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  created_by uuid not null,
  client_id uuid,
  title text not null,
  description text,
  status text not null default 'active',
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
);

alter table public.contracts add column if not exists content text;
alter table public.contracts add column if not exists metadata jsonb;
alter table public.cases add column if not exists custom_fields jsonb;
alter table public.cases add column if not exists court text;
alter table public.organizations add column if not exists status text default 'active';
alter table public.organizations add column if not exists is_active boolean default true;

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
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null,
  created_by uuid not null,
  title text not null,
  description text,
  completed boolean not null default false,
  priority text,
  due_date timestamptz,
  assigned_to uuid,
  task_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  created_by uuid not null,
  title text not null,
  description text,
  start_date timestamptz not null,
  end_date timestamptz not null,
  location text,
  attendees jsonb,
  event_type text,
  case_id uuid,
  client_id uuid,
  is_recurring boolean default false,
  recurrence_pattern jsonb,
  recurrence_end_date timestamptz,
  source text default 'internal',
  external_event_id text,
  external_source text,
  external_calendar_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_shares (
  id uuid primary key default gen_random_uuid(),
  calendar_owner_id uuid not null,
  shared_with_user_id uuid not null,
  organization_id uuid not null,
  permission_level text not null default 'view',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_calendar_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  organization_id uuid not null,
  provider text not null,
  external_user_id text,
  external_email text,
  sync_enabled boolean not null default true,
  sync_direction text not null default 'bidirectional',
  last_sync_at timestamptz,
  sync_settings jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_name text not null,
  organization_id uuid not null,
  resource text not null,
  action text not null,
  granted boolean not null default false,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role_name, organization_id, resource, action)
);

create table if not exists public.user_role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  organization_id uuid not null,
  role_name text not null,
  assigned_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  role_name text not null,
  description text,
  permissions jsonb default '[]',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  organization_id uuid not null,
  role text default 'user',
  department text,
  invited_by uuid,
  status text default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists calendar_color text;
alter table public.profiles add column if not exists is_organization_creator boolean default false;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  type text not null default 'direct',
  name text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_participants (
  conversation_id uuid not null,
  user_id uuid not null,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

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
);

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);

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
);

create table if not exists public.user_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price_monthly numeric,
  price_yearly numeric,
  currency text default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid,
  status text,
  billing_interval text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  organization_id uuid not null,
  title text not null,
  description text,
  type text,
  status text not null default 'unread',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  organization_id uuid not null,
  email_enabled boolean not null default true,
  email_frequency text not null default 'immediate',
  in_app_enabled boolean not null default true,
  case_notifications boolean not null default true,
  client_notifications boolean not null default true,
  document_notifications boolean not null default true,
  contract_notifications boolean not null default true,
  calendar_notifications boolean not null default true,
  task_notifications boolean not null default true,
  invoice_notifications boolean not null default true,
  general_notifications boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, organization_id)
);

alter table public.documents add column if not exists contract_type text;
alter table public.documents add column if not exists currency text;
alter table public.documents add column if not exists effective_date date;
alter table public.documents add column if not exists renewal_date date;
alter table public.documents add column if not exists termination_date date;
alter table public.documents add column if not exists value numeric;
alter table public.documents add column if not exists terms text;
alter table public.documents add column if not exists metadata jsonb;
alter table public.documents add column if not exists file_size bigint;
alter table public.tasks add column if not exists case_id uuid;
alter table public.tasks add column if not exists created_by uuid;
alter table public.tasks add column if not exists title text;
alter table public.tasks add column if not exists description text;
alter table public.tasks add column if not exists completed boolean not null default false;
alter table public.tasks add column if not exists priority text;
alter table public.tasks add column if not exists due_date timestamptz;
alter table public.tasks add column if not exists assigned_to uuid;
alter table public.tasks add column if not exists task_type text;
alter table public.tasks add column if not exists created_at timestamptz not null default now();
alter table public.tasks add column if not exists updated_at timestamptz not null default now();
alter table public.notifications add column if not exists user_id uuid;
alter table public.notifications add column if not exists organization_id uuid;
alter table public.notifications add column if not exists title text;
alter table public.notifications add column if not exists description text;
alter table public.notifications add column if not exists type text;
alter table public.notifications add column if not exists status text not null default 'unread';
alter table public.notifications add column if not exists archived_at timestamptz;
alter table public.notifications add column if not exists created_at timestamptz not null default now();
alter table public.notifications add column if not exists updated_at timestamptz not null default now();
alter table public.notification_preferences add column if not exists user_id uuid;
alter table public.notification_preferences add column if not exists organization_id uuid;
alter table public.notification_preferences add column if not exists email_enabled boolean not null default true;
alter table public.notification_preferences add column if not exists email_frequency text not null default 'immediate';
alter table public.notification_preferences add column if not exists in_app_enabled boolean not null default true;
alter table public.notification_preferences add column if not exists case_notifications boolean not null default true;
alter table public.notification_preferences add column if not exists client_notifications boolean not null default true;
alter table public.notification_preferences add column if not exists document_notifications boolean not null default true;
alter table public.notification_preferences add column if not exists contract_notifications boolean not null default true;
alter table public.notification_preferences add column if not exists calendar_notifications boolean not null default true;
alter table public.notification_preferences add column if not exists task_notifications boolean not null default true;
alter table public.notification_preferences add column if not exists invoice_notifications boolean not null default true;
alter table public.notification_preferences add column if not exists general_notifications boolean not null default true;
alter table public.notification_preferences add column if not exists created_at timestamptz not null default now();
alter table public.notification_preferences add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_conversations_org on public.conversations(organization_id);
create index if not exists idx_participants_user on public.conversation_participants(user_id);
create index if not exists idx_messages_conversation_created on public.messages(conversation_id, created_at);
create index if not exists idx_ai_conversations_owner on public.ai_conversations(organization_id, user_id);
create index if not exists idx_ai_messages_conversation on public.ai_conversation_messages(conversation_id, created_at);
create index if not exists idx_admin_actions_created on public.admin_actions(created_at);
create index if not exists idx_tasks_case_due on public.tasks(case_id, due_date, created_at);
create unique index if not exists idx_notification_preferences_user_org on public.notification_preferences(user_id, organization_id);
create index if not exists idx_notifications_org_created on public.notifications(organization_id, created_at);
create index if not exists idx_notifications_user_status on public.notifications(user_id, status, created_at);
create index if not exists idx_calendar_events_org_start on public.calendar_events(organization_id, start_date);
create index if not exists idx_calendar_shares_owner on public.calendar_shares(calendar_owner_id, is_active);
create index if not exists idx_calendar_shares_shared on public.calendar_shares(shared_with_user_id, is_active);
create index if not exists idx_user_calendar_integrations_user on public.user_calendar_integrations(user_id, organization_id);
create index if not exists idx_role_permissions_role_org on public.role_permissions(role_name, organization_id);
create index if not exists idx_user_role_assignments_user on public.user_role_assignments(user_id, organization_id);
create unique index if not exists idx_role_permissions_uq on public.role_permissions(role_name, organization_id, resource, action);

insert into public.profiles (user_id, organization_id, email, first_name, last_name)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'dev@kourti.local',
  'Dev',
  'User'
)
on conflict (user_id) do nothing;

insert into public.organizations (id, name, email)
values (
  '00000000-0000-0000-0000-000000000001',
  'Kourti Local Dev Org',
  'dev@kourti.local'
)
on conflict (id) do nothing;
