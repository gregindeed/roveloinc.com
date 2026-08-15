-- ============================================================================
-- roveloinc.com — Team access
-- Adds two collaborator tiers on top of owner/admin + portal clients:
--   • manager  = role 'admin', is_owner=false → works across ALL entities
--   • collaborator = role 'collaborator' → works only on GRANTED entities
--   • only the owner (is_owner=true) can manage the team
-- Run AFTER schema.sql / documents.sql / compliance.sql / entity_profile.sql /
-- ai.sql / folders.sql. Safe to re-run.
-- NOTE: if the very first line errors with "ALTER TYPE ... ADD VALUE cannot run
-- inside a transaction block", run that single line on its own first, then run
-- the rest.
-- ============================================================================

-- 1. New role for external collaborators.
alter type public.user_role add value if not exists 'collaborator';

-- 2. Owner flag — only the owner manages the team. Bootstrap current admin(s).
alter table public.profiles add column if not exists is_owner boolean not null default false;
update public.profiles set is_owner = true where role = 'admin';

-- 3. Per-entity access grants (which user may work on which entity).
create table if not exists public.entity_access (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  client_id  uuid not null references public.clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, client_id)
);
create index if not exists entity_access_user_idx   on public.entity_access(user_id);
create index if not exists entity_access_client_idx on public.entity_access(client_id);
alter table public.entity_access enable row level security;

-- 4. Access helpers (SECURITY DEFINER → no RLS recursion).
create or replace function public.is_owner()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_owner = true);
$$;

-- read+write "work on" access: owner/manager (all) OR a granted collaborator.
create or replace function public.can_write_entity(cid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.entity_access ea
                 where ea.user_id = auth.uid() and ea.client_id = cid);
$$;

-- read access: anyone who can work on it, OR the portal client for that entity.
create or replace function public.can_read_entity(cid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.can_write_entity(cid) or cid = public.current_client_id();
$$;

-- entity_access: only the owner manages; a user may see their own grants.
drop policy if exists entity_access_owner     on public.entity_access;
drop policy if exists entity_access_self_read on public.entity_access;
create policy entity_access_owner     on public.entity_access for all    using (public.is_owner()) with check (public.is_owner());
create policy entity_access_self_read on public.entity_access for select using (user_id = auth.uid());

-- 5. Rewrite every client-scoped table's policies to honor grants.
--    <t>_write = can_write_entity(client_id); <t>_read = can_read_entity(client_id).

-- clients (scope = id)
drop policy if exists clients_admin_all on public.clients;
drop policy if exists clients_own_read  on public.clients;
drop policy if exists clients_write     on public.clients;
drop policy if exists clients_read      on public.clients;
create policy clients_write on public.clients for all    using (public.can_write_entity(id)) with check (public.can_write_entity(id));
create policy clients_read  on public.clients for select using (public.can_read_entity(id));

-- deposits
drop policy if exists deposits_admin_all  on public.deposits;
drop policy if exists deposits_client_read on public.deposits;
drop policy if exists deposits_write on public.deposits;
drop policy if exists deposits_read  on public.deposits;
create policy deposits_write on public.deposits for all    using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));
create policy deposits_read  on public.deposits for select using (public.can_read_entity(client_id));

-- checking_expenses
drop policy if exists checking_admin_all  on public.checking_expenses;
drop policy if exists checking_client_read on public.checking_expenses;
drop policy if exists checking_write on public.checking_expenses;
drop policy if exists checking_read  on public.checking_expenses;
create policy checking_write on public.checking_expenses for all    using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));
create policy checking_read  on public.checking_expenses for select using (public.can_read_entity(client_id));

-- cc_transactions
drop policy if exists cc_admin_all  on public.cc_transactions;
drop policy if exists cc_client_read on public.cc_transactions;
drop policy if exists cc_write on public.cc_transactions;
drop policy if exists cc_read  on public.cc_transactions;
create policy cc_write on public.cc_transactions for all    using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));
create policy cc_read  on public.cc_transactions for select using (public.can_read_entity(client_id));

-- documents (portal-client insert/delete policies below are left intact)
drop policy if exists documents_admin_all  on public.documents;
drop policy if exists documents_client_read on public.documents;
drop policy if exists documents_write on public.documents;
drop policy if exists documents_read  on public.documents;
create policy documents_write on public.documents for all    using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));
create policy documents_read  on public.documents for select using (public.can_read_entity(client_id));

-- obligations
drop policy if exists obligations_admin_all  on public.obligations;
drop policy if exists obligations_client_read on public.obligations;
drop policy if exists obligations_write on public.obligations;
drop policy if exists obligations_read  on public.obligations;
create policy obligations_write on public.obligations for all    using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));
create policy obligations_read  on public.obligations for select using (public.can_read_entity(client_id));

-- obligation_events
drop policy if exists oevents_admin_all  on public.obligation_events;
drop policy if exists oevents_client_read on public.obligation_events;
drop policy if exists oevents_write on public.obligation_events;
drop policy if exists oevents_read  on public.obligation_events;
create policy oevents_write on public.obligation_events for all    using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));
create policy oevents_read  on public.obligation_events for select using (public.can_read_entity(client_id));

-- entity_officers
drop policy if exists officers_admin_all  on public.entity_officers;
drop policy if exists officers_client_read on public.entity_officers;
drop policy if exists officers_write on public.entity_officers;
drop policy if exists officers_read  on public.entity_officers;
create policy officers_write on public.entity_officers for all    using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));
create policy officers_read  on public.entity_officers for select using (public.can_read_entity(client_id));

-- ai_assessments
drop policy if exists ai_admin_all  on public.ai_assessments;
drop policy if exists ai_client_read on public.ai_assessments;
drop policy if exists ai_write on public.ai_assessments;
drop policy if exists ai_read  on public.ai_assessments;
create policy ai_write on public.ai_assessments for all    using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));
create policy ai_read  on public.ai_assessments for select using (public.can_read_entity(client_id));

-- document_years
drop policy if exists "document_years admin all"   on public.document_years;
drop policy if exists "document_years client read" on public.document_years;
drop policy if exists document_years_write on public.document_years;
drop policy if exists document_years_read  on public.document_years;
create policy document_years_write on public.document_years for all    using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));
create policy document_years_read  on public.document_years for select using (public.can_read_entity(client_id));

-- 6. Team management is owner-only (managers work, but don't manage the team).
drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles for all using (public.is_owner()) with check (public.is_owner());
-- profiles_read stays: (id = auth.uid() or is_admin())

-- 7. Storage: collaborators get read/write on their granted clients' folders.
--    (admin + portal-client storage policies from documents.sql stay intact.)
drop policy if exists "client-docs collab all" on storage.objects;
create policy "client-docs collab all" on storage.objects for all
  using (bucket_id = 'client-docs' and exists (
    select 1 from public.entity_access ea
    where ea.user_id = auth.uid() and ea.client_id::text = (storage.foldername(name))[1]))
  with check (bucket_id = 'client-docs' and exists (
    select 1 from public.entity_access ea
    where ea.user_id = auth.uid() and ea.client_id::text = (storage.foldername(name))[1]));

notify pgrst, 'reload schema';
