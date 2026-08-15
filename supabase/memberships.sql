-- ── Multi-firm membership ────────────────────────────────────────────────────
-- A person can belong to multiple firms with different roles. Managers get a
-- membership row per firm; collaborators keep working via entity_access grants
-- (no membership needed). Platform super-admin = an admin membership in the
-- platform firm (Rovelo). Run AFTER firms.sql.

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  role text not null check (role in ('admin', 'collaborator')),
  created_at timestamptz not null default now(),
  unique (user_id, org_id)
);
create index if not exists memberships_user_idx on public.memberships (user_id);
create index if not exists memberships_org_idx on public.memberships (org_id);
alter table public.memberships enable row level security;

-- Make collaborator grants idempotent (safe to re-grant).
create unique index if not exists entity_access_user_client_uniq on public.entity_access (user_id, client_id);

-- Backfill: every current admin (manager / platform admin) gets a membership in
-- their firm. Collaborators are covered by entity_access and need none.
insert into public.memberships (user_id, org_id, role)
select id, org_id, 'admin' from public.profiles
where role = 'admin' and org_id is not null
on conflict (user_id, org_id) do nothing;

-- Helpers (membership-based) -------------------------------------------------
create or replace function public.is_platform()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    join public.organizations o on o.id = m.org_id
    where m.user_id = auth.uid() and m.role = 'admin' and o.is_platform = true
  );
$$;

-- Admin of a specific firm (platform admins count for every firm).
create or replace function public.is_firm_admin(oid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_platform()
      or exists (select 1 from public.memberships m
                 where m.user_id = auth.uid() and m.org_id = oid and m.role = 'admin');
$$;

create or replace function public.can_write_entity(cid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_firm_admin(public.client_org(cid))
      or exists (select 1 from public.entity_access ea where ea.user_id = auth.uid() and ea.client_id = cid);
$$;

create or replace function public.can_read_entity(cid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.can_write_entity(cid) or cid = public.current_client_id();
$$;

-- memberships policies -------------------------------------------------------
drop policy if exists memberships_read  on public.memberships;
drop policy if exists memberships_write on public.memberships;
create policy memberships_read on public.memberships for select
  using (user_id = auth.uid() or public.is_firm_admin(org_id));
create policy memberships_write on public.memberships for all
  using (public.is_firm_admin(org_id)) with check (public.is_firm_admin(org_id));

-- organizations policies -----------------------------------------------------
drop policy if exists organizations_read  on public.organizations;
drop policy if exists organizations_write on public.organizations;
create policy organizations_read on public.organizations for select
  using (public.is_firm_admin(id));
create policy organizations_write on public.organizations for all
  using (public.is_platform()) with check (public.is_platform());

-- clients row policies (membership-aware) ------------------------------------
drop policy if exists clients_read   on public.clients;
drop policy if exists clients_insert on public.clients;
drop policy if exists clients_update on public.clients;
drop policy if exists clients_delete on public.clients;
create policy clients_read on public.clients for select
  using (public.can_read_entity(id));
create policy clients_insert on public.clients for insert
  with check (public.is_firm_admin(org_id));
create policy clients_update on public.clients for update
  using (public.is_firm_admin(org_id)) with check (public.is_firm_admin(org_id));
create policy clients_delete on public.clients for delete
  using (public.is_platform());

notify pgrst, 'reload schema';
