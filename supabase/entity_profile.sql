-- ============================================================================
-- roveloinc.com — Richer entity profile (extra fields + officers/ownership)
-- Run in the Supabase SQL editor after entities.sql. Idempotent.
-- ============================================================================

alter table public.clients
  add column if not exists dba                      text,
  add column if not exists website                  text,
  add column if not exists mailing_address          text,
  add column if not exists registered_agent         text,
  add column if not exists registered_agent_address text,
  add column if not exists accounting_method        text,   -- 'cash' | 'accrual'
  add column if not exists employee_count           integer;

-- Officers / owners of the entity, with ownership percentage.
create table if not exists public.entity_officers (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  name          text not null,
  title         text,
  ownership_pct numeric(5,2),
  email         text,
  phone         text,
  created_at    timestamptz not null default now()
);
create index if not exists entity_officers_client_idx on public.entity_officers(client_id);

alter table public.entity_officers enable row level security;

drop policy if exists officers_admin_all   on public.entity_officers;
drop policy if exists officers_client_read on public.entity_officers;
create policy officers_admin_all  on public.entity_officers for all
  using (public.is_admin()) with check (public.is_admin());
create policy officers_client_read on public.entity_officers for select
  using (client_id = public.current_client_id());
