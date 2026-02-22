-- Recreate contracts table after schema refactor
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  client_id uuid constraint fk_contracts_client_id references public.clients(id) on delete set null,
  title text not null,
  description text,
  contract_type text,
  status text default 'draft',
  value decimal(15,2),
  currency text default 'USD',
  start_date date,
  end_date date,
  terms text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table public.contracts enable row level security;

-- Trigger to auto-update updated_at
create trigger update_contracts_updated_at
  before update on public.contracts
  for each row execute function public.update_updated_at_column();

-- Helpful index for organization lookups
create index if not exists idx_contracts_organization_id on public.contracts(organization_id);

-- RLS Policies
create policy "Users can view contracts in their organization"
  on public.contracts
  for select
  using (organization_id = public.get_user_organization_id());

create policy "Users can create contracts in their organization"
  on public.contracts
  for insert
  with check (organization_id = public.get_user_organization_id());

create policy "Users can update contracts in their organization"
  on public.contracts
  for update
  using (organization_id = public.get_user_organization_id());

create policy "Users can delete contracts in their organization"
  on public.contracts
  for delete
  using (organization_id = public.get_user_organization_id());
