-- Create invitations table for user invites
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  role public.user_role not null default 'user',
  department text,
  invited_by uuid not null, -- auth user id of inviter
  status text not null default 'pending', -- pending | accepted | revoked | expired
  token uuid not null default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invitations_status_chk check (status in ('pending','accepted','revoked','expired'))
);

-- Indexes and constraints
create index if not exists invitations_org_idx on public.invitations(organization_id);
create unique index if not exists invitations_unique_pending on public.invitations(organization_id, email) where status = 'pending';

-- RLS
alter table public.invitations enable row level security;

-- Helper function to check if current user is admin/superadmin in their org
create or replace function public.current_user_is_org_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role in ('admin','superadmin')
  );
$$;

-- Policies: admins of an org can manage their org's invitations
create policy if not exists "Admins can view org invitations"
  on public.invitations for select
  using (
    public.current_user_is_org_admin() and
    organization_id = (select organization_id from public.profiles where user_id = auth.uid())
  );

create policy if not exists "Admins can insert org invitations"
  on public.invitations for insert
  with check (
    public.current_user_is_org_admin() and
    organization_id = (select organization_id from public.profiles where user_id = auth.uid())
  );

create policy if not exists "Admins can update org invitations"
  on public.invitations for update
  using (
    public.current_user_is_org_admin() and
    organization_id = (select organization_id from public.profiles where user_id = auth.uid())
  );

create policy if not exists "Admins can delete org invitations"
  on public.invitations for delete
  using (
    public.current_user_is_org_admin() and
    organization_id = (select organization_id from public.profiles where user_id = auth.uid())
  );

-- Trigger to auto-update updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger if not exists trg_invitations_set_updated
before update on public.invitations
for each row execute function public.set_updated_at();

-- Update invite_user_to_organization to handle existing users and invitations
create or replace function public.invite_user_to_organization(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_role text,
  p_department text default null
) returns json
language plpgsql
security definer
set search_path to 'auth','public'
as $$
DECLARE
  current_user_role text;
  current_org_id uuid;
  invited_user_id uuid;
  normalized_role public.user_role;
BEGIN
  -- Get current user's role and organization
  select role::text, organization_id into current_user_role, current_org_id
  from public.profiles
  where user_id = auth.uid();

  -- Check permissions
  IF current_user_role NOT IN ('superadmin', 'admin') THEN
    return json_build_object('error','Insufficient permissions to invite users');
  END IF;

  -- Validate role param and cast to enum
  IF p_role NOT IN ('superadmin','admin','user') THEN
    return json_build_object('error','Invalid role specified');
  END IF;
  normalized_role := p_role::public.user_role;

  -- Check if user already exists in auth.users
  select id into invited_user_id from auth.users where email = p_email;

  IF invited_user_id IS NOT NULL THEN
    -- If user exists, upsert their profile into this organization
    -- If a profile already exists for this user, update org and role
    IF exists(select 1 from public.profiles where user_id = invited_user_id) THEN
      update public.profiles
        set organization_id = current_org_id,
            role = normalized_role,
            department = p_department,
            first_name = coalesce(first_name, p_first_name),
            last_name = coalesce(last_name, p_last_name),
            email = coalesce(email, p_email),
            updated_at = now()
      where user_id = invited_user_id;
    ELSE
      insert into public.profiles(
        user_id, first_name, last_name, email, organization_id, role, department, is_organization_creator, created_at, updated_at
      ) values (
        invited_user_id, p_first_name, p_last_name, p_email, current_org_id, normalized_role, p_department, false, now(), now()
      );
    END IF;

    return json_build_object('success', true, 'message','Existing user added to organization');
  END IF;

  -- Otherwise, create an invitation record
  insert into public.invitations(
    organization_id, email, first_name, last_name, role, department, invited_by
  ) values (
    current_org_id, p_email, p_first_name, p_last_name, normalized_role, p_department, auth.uid()
  )
  on conflict (organization_id, email) where status = 'pending' do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    role = excluded.role,
    department = excluded.department,
    invited_by = excluded.invited_by,
    expires_at = now() + interval '14 days',
    updated_at = now();

  return json_build_object('success', true, 'message','Invitation created');
END;
$$;