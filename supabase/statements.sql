-- ── Statement imports + reconciliation ──────────────────────────────────────
-- One row per imported bank/card statement: what was parsed, how many rows were
-- inserted, and whether the parsed activity ties to the statement's balances.
-- Run AFTER schema.sql / access.sql / ledger.sql.

create table if not exists public.statement_imports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  filename text,
  storage_path text,
  statement_type text,               -- 'bank' | 'card'
  period_start date,
  period_end date,
  opening_balance numeric,
  closing_balance numeric,
  total_in numeric,
  total_out numeric,
  inserted_count int,
  reconciled boolean,
  difference numeric,                -- closing − expected (0 when tied)
  created_at timestamptz not null default now()
);

create index if not exists statement_imports_client_idx on public.statement_imports (client_id, created_at desc);

alter table public.statement_imports enable row level security;
drop policy if exists statement_imports_write on public.statement_imports;
drop policy if exists statement_imports_read  on public.statement_imports;
create policy statement_imports_write on public.statement_imports for all
  using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));
create policy statement_imports_read on public.statement_imports for select
  using (public.can_read_entity(client_id));

notify pgrst, 'reload schema';
