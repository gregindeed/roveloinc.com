-- Leads — a lightweight sales pipeline of prospective accounts.
-- A lead is a stripped-down account you haven't onboarded yet: name, contact,
-- business/individual, a stage, a source, and notes. "Convert" turns a won lead
-- into a real client (clients row) and stamps converted_client_id here.
--
-- Firm-scoped: a lead belongs to an organization (firm). The app reads/writes
-- leads through the service-role client with server-side auth checks (same as
-- the team/firms admin pages); the RLS policy below is a backstop that lets a
-- firm's members touch only their firm's leads.
--
-- Idempotent: safe to re-run.

create table if not exists public.leads (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid references public.organizations(id) on delete cascade,
  kind                 text not null default 'business' check (kind in ('business','individual')),
  name                 text not null,
  contact_name         text,
  email                text,
  phone                text,
  tax_id               text,                                              -- EIN / tax id, optional
  address              text,
  stage                text not null default 'new'
                         check (stage in ('new','contacted','qualified','won','lost')),
  source               text,                                             -- 'manual' | 'import' | 'referral' | ...
  notes                text,
  assigned_to          uuid references auth.users(id) on delete set null,
  converted_client_id  uuid references public.clients(id) on delete set null,
  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists leads_org_idx   on public.leads(org_id);
create index if not exists leads_stage_idx  on public.leads(stage);

alter table public.leads enable row level security;

-- A firm's members may read/write that firm's leads. Platform admins (admin in a
-- platform org) may touch every firm's leads.
drop policy if exists leads_rw on public.leads;
create policy leads_rw on public.leads for all
  using (
    org_id in (select m.org_id from public.memberships m where m.user_id = auth.uid())
    or exists (
      select 1 from public.memberships m
      join public.organizations o on o.id = m.org_id
      where m.user_id = auth.uid() and m.role = 'admin' and o.is_platform
    )
  )
  with check (
    org_id in (select m.org_id from public.memberships m where m.user_id = auth.uid())
    or exists (
      select 1 from public.memberships m
      join public.organizations o on o.id = m.org_id
      where m.user_id = auth.uid() and m.role = 'admin' and o.is_platform
    )
  );

notify pgrst, 'reload schema';
