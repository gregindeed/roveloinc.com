-- ============================================================================
-- roveloinc.com — Phase 2: compliance engine (obligations + generated schedule)
-- Run in the Supabase SQL editor, after entities.sql. Idempotent.
-- ============================================================================

do $$ begin
  create type public.obligation_frequency as enum
    ('monthly', 'quarterly', 'annual', 'biennial', 'prepayment', 'one_time');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.event_status as enum
    ('upcoming', 'due', 'paid', 'filed', 'overdue', 'waived');
exception when duplicate_object then null; end $$;

-- An entity's enrollment in a recurring compliance requirement.
-- e.g. "Reyes Tires — CDTFA Sales Tax (prepayment plan)".
create table if not exists public.obligations (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients(id) on delete cascade,
  agency         public.gov_agency not null,
  kind           text not null,          -- 'cdtfa_prepayment', 'ftb_franchise_tax', ...
  label          text not null,          -- human label
  frequency      public.obligation_frequency not null,
  default_amount numeric(12,2),          -- estimated amount per period
  active         boolean not null default true,
  notes          text,
  created_at     timestamptz not null default now()
);
create index if not exists obligations_client_idx on public.obligations(client_id);

-- Individual due items generated from an obligation (the yearly schedule).
create table if not exists public.obligation_events (
  id            uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.obligations(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  period_label  text not null,           -- 'Q2 2026', 'Apr 2026', '2026'
  due_date      date not null,
  amount_due    numeric(12,2),
  amount_paid   numeric(12,2),
  paid_date     date,
  status        public.event_status not null default 'upcoming',
  confirmation  text,                    -- confirmation / receipt number
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists obligation_events_client_idx on public.obligation_events(client_id);
create index if not exists obligation_events_due_idx     on public.obligation_events(due_date);
create index if not exists obligation_events_status_idx  on public.obligation_events(status);

-- ---------- Row-Level Security ----------
alter table public.obligations       enable row level security;
alter table public.obligation_events enable row level security;

-- Admins manage everything; clients read only their own (read-only compliance view).
drop policy if exists obligations_admin_all   on public.obligations;
drop policy if exists obligations_client_read  on public.obligations;
create policy obligations_admin_all  on public.obligations for all
  using (public.is_admin()) with check (public.is_admin());
create policy obligations_client_read on public.obligations for select
  using (client_id = public.current_client_id());

drop policy if exists oevents_admin_all   on public.obligation_events;
drop policy if exists oevents_client_read on public.obligation_events;
create policy oevents_admin_all  on public.obligation_events for all
  using (public.is_admin()) with check (public.is_admin());
create policy oevents_client_read on public.obligation_events for select
  using (client_id = public.current_client_id());
