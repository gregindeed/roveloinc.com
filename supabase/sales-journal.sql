-- ── Sales journal (revenue subledger) ───────────────────────────────────────
-- The operational record of what a business SOLD, independent of the bank feed:
-- one row per sale / daily line, tagged by revenue stream (a chart-of-accounts
-- income account) and by tender (how it was paid). This is the source the income
-- grid and the tender report read from, and the "sales" side of reconciliation
-- against bank deposits.
--
-- Client-scoped and RLS-guarded exactly like deposits / checking_expenses:
--   • staff (owner / manager / granted collaborator) read + write
--   • the portal client reads their own rows, but does NOT write them
--     (staff feed the journal — manually, by import, by AI extract, or Clover)
--
-- Run AFTER schema.sql / access.sql / ledger.sql. Purely additive and safe to
-- re-run: it creates ONE new table and touches no existing table.

create table if not exists public.sales_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  entry_date date not null,

  -- Revenue stream = an income account in THIS entity's chart of accounts, so
  -- the grid columns are per-business automatically. Nullable until categorized
  -- (mirrors deposits.account_id).
  account_id uuid references public.chart_of_accounts(id),

  -- How it was paid — the dimension that makes bank reconciliation possible.
  tender text not null default 'other'
    check (tender in ('cash','card','check','ach','financing','other')),

  -- Optional card/payment processor (e.g. 'clover','square','stripe') for fee
  -- reconciliation later; null for cash/check.
  processor text,

  amount numeric not null,
  qty int,                        -- optional units sold (e.g. # of tires)
  memo text,

  -- Where the row came from, and a pointer back to its origin.
  source text not null default 'manual'
    check (source in ('manual','import','ai_extract','clover')),
  source_ref text,                -- import batch id / document id / clover order id

  -- Trust gate: imported / AI-extracted rows land 'pending' for staff review;
  -- only 'posted' rows count in the books. 'void' keeps a row without counting.
  status text not null default 'posted'
    check (status in ('pending','posted','void')),

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists sales_entries_client_date_idx
  on public.sales_entries (client_id, entry_date);
create index if not exists sales_entries_account_idx
  on public.sales_entries (account_id);

alter table public.sales_entries enable row level security;
drop policy if exists sales_entries_write on public.sales_entries;
drop policy if exists sales_entries_read  on public.sales_entries;
create policy sales_entries_write on public.sales_entries for all
  using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));
create policy sales_entries_read on public.sales_entries for select
  using (public.can_read_entity(client_id));

notify pgrst, 'reload schema';
