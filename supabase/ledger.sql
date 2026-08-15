-- ── Ledger foundation: Chart of Accounts ────────────────────────────────────
-- Each entity gets its OWN chart of accounts (client-scoped). Transactions will
-- reference an account; the P&L aggregates by account.
-- Run AFTER schema.sql / access.sql (needs can_write_entity / can_read_entity).

create table if not exists public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  code text not null,
  name text not null,
  type text not null check (type in ('income','cogs','expense','asset','liability','equity')),
  tax_line text,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (client_id, code)
);

create index if not exists chart_of_accounts_client_idx on public.chart_of_accounts (client_id);

alter table public.chart_of_accounts enable row level security;
drop policy if exists chart_of_accounts_write on public.chart_of_accounts;
drop policy if exists chart_of_accounts_read  on public.chart_of_accounts;
create policy chart_of_accounts_write on public.chart_of_accounts for all
  using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));
create policy chart_of_accounts_read on public.chart_of_accounts for select
  using (public.can_read_entity(client_id));

-- Link transactions to an account (nullable until categorized). The existing
-- free-text `category` stays as the original memo/label.
alter table public.deposits           add column if not exists account_id uuid references public.chart_of_accounts(id);
alter table public.checking_expenses  add column if not exists account_id uuid references public.chart_of_accounts(id);
alter table public.cc_transactions     add column if not exists account_id uuid references public.chart_of_accounts(id);

notify pgrst, 'reload schema';
