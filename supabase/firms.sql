-- ── Multi-firm foundation ────────────────────────────────────────────────────
-- Introduces "firms" (organizations): Rovelo Inc is the platform firm whose
-- admins are super-admins across every firm; partner firms get their own
-- accountant-manager accounts, walled to their own clients.
-- Run AFTER access.sql / ledger.sql / statements.sql / audit-p0.sql.
-- (This supersedes audit-p0's clients policies with org-aware versions.)

-- 1. Firms -------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  is_platform boolean not null default false,   -- the home firm (Rovelo)
  created_at timestamptz not null default now()
);
alter table public.organizations enable row level security;

-- 2. Scope clients + profiles to a firm --------------------------------------
alter table public.clients  add column if not exists org_id uuid references public.organizations(id);
alter table public.profiles add column if not exists org_id uuid references public.organizations(id);
create index if not exists clients_org_idx  on public.clients (org_id);
create index if not exists profiles_org_idx on public.profiles (org_id);

-- 3. Backfill: create the home firm and assign all existing rows to it -------
do $$
declare home uuid;
begin
  select id into home from public.organizations where is_platform = true limit 1;
  if home is null then
    insert into public.organizations (name, slug, is_platform)
      values ('Rovelo Inc', 'rovelo-inc', true) returning id into home;
  end if;
  update public.clients  set org_id = home where org_id is null;
  update public.profiles set org_id = home where org_id is null;
end $$;

-- 4. Org-aware access helpers ------------------------------------------------
-- A platform super-admin = an admin whose firm is the platform firm (Rovelo).
create or replace function public.is_platform()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    join public.organizations o on o.id = p.org_id
    where p.id = auth.uid() and p.role = 'admin' and o.is_platform = true
  );
$$;

create or replace function public.my_org()
returns uuid language sql security definer stable set search_path = public as $$
  select org_id from public.profiles where id = auth.uid();
$$;

create or replace function public.client_org(cid uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select org_id from public.clients where id = cid;
$$;

-- Work access is now org-scoped: platform admins (Rovelo) see everything; a
-- firm's own admins see only their firm's clients; collaborators keep their
-- explicit per-entity grants (which are always within their firm).
create or replace function public.can_write_entity(cid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_platform()
      or (public.is_admin() and public.client_org(cid) = public.my_org())
      or exists (select 1 from public.entity_access ea where ea.user_id = auth.uid() and ea.client_id = cid);
$$;

create or replace function public.can_read_entity(cid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.can_write_entity(cid) or cid = public.current_client_id();
$$;

-- 5. Firm policies -----------------------------------------------------------
drop policy if exists organizations_read  on public.organizations;
drop policy if exists organizations_write on public.organizations;
create policy organizations_read on public.organizations for select
  using (public.is_platform() or id = public.my_org());
create policy organizations_write on public.organizations for all
  using (public.is_platform()) with check (public.is_platform());

-- 6. Clients row policies (org-aware) ----------------------------------------
drop policy if exists clients_read   on public.clients;
drop policy if exists clients_insert on public.clients;
drop policy if exists clients_update on public.clients;
drop policy if exists clients_delete on public.clients;
create policy clients_read on public.clients for select
  using (public.can_read_entity(id));
create policy clients_insert on public.clients for insert
  with check (public.is_platform() or (public.is_admin() and org_id = public.my_org()));
create policy clients_update on public.clients for update
  using (public.is_platform() or (public.is_admin() and org_id = public.my_org()))
  with check (public.is_platform() or (public.is_admin() and org_id = public.my_org()));
create policy clients_delete on public.clients for delete
  using (public.is_platform());

notify pgrst, 'reload schema';
