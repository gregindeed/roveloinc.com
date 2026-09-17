-- Firm-level collaboration on an account.
-- Distinct from per-person entity_access grants: this assigns a WHOLE firm as a
-- collaborator on an account owned by another firm. The account then appears on
-- the collaborating firm's roster (marked "Collaborating"), and that firm's
-- managers gain read access to it.
--
-- Individual collaborators stay in entity_access, unchanged.
-- Idempotent: safe to re-run. Depends on: clients, organizations, memberships.

create table if not exists public.firm_collaborators (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,   -- the collaborating firm
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (client_id, org_id)
);

create index if not exists firm_collaborators_org_idx    on public.firm_collaborators(org_id);
create index if not exists firm_collaborators_client_idx on public.firm_collaborators(client_id);

-- True when the current user is a manager (membership) of a firm that has been
-- assigned as a collaborator on this client.
create or replace function public.firm_collaborates(cid uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1
    from public.firm_collaborators fc
    join public.memberships m on m.org_id = fc.org_id
    where fc.client_id = cid and m.user_id = auth.uid()
  );
$$;

alter table public.firm_collaborators enable row level security;

-- Read: members of the collaborating firm, members of the owner firm, and
-- platform admins. Writes go through the service-role client in the app.
drop policy if exists firm_collaborators_read on public.firm_collaborators;
create policy firm_collaborators_read on public.firm_collaborators for select using (
  org_id in (select m.org_id from public.memberships m where m.user_id = auth.uid())
  or exists (
    select 1 from public.clients c
    join public.memberships m on m.org_id = c.org_id
    where c.id = client_id and m.user_id = auth.uid()
  )
  or exists (
    select 1 from public.memberships m
    join public.organizations o on o.id = m.org_id
    where m.user_id = auth.uid() and m.role = 'admin' and o.is_platform
  )
);

-- Additive read policy on clients: a firm's managers may read accounts their
-- firm collaborates on. Combined (OR'd) with the existing clients policies.
drop policy if exists clients_firm_collab_read on public.clients;
create policy clients_firm_collab_read on public.clients for select using (public.firm_collaborates(id));

notify pgrst, 'reload schema';
