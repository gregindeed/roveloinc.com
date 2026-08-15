-- ── Plaid bank feeds ─────────────────────────────────────────────────────────
-- Connect a client's bank/card accounts so transactions flow in automatically
-- instead of being hand-uploaded — turning "always up to date" into the default.
--
-- SECURITY: plaid_items holds the Plaid access_token, which must NEVER reach a
-- browser. RLS is enabled with NO policies, so normal (anon/authenticated)
-- clients can't read it at all; only the service role (server actions + the
-- webhook route) touches this table, and the UI is only ever handed safe columns
-- (institution, status, last sync) selected server-side.
-- Run AFTER schema.sql / ledger.sql. Re-runnable.

create table if not exists public.plaid_items (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients(id) on delete cascade,
  item_id          text not null unique,
  access_token     text not null,
  institution_name text,
  cursor           text,                 -- transactions/sync cursor
  status           text not null default 'active', -- active | error | disconnected
  last_synced_at   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists plaid_items_client_idx on public.plaid_items (client_id);
alter table public.plaid_items enable row level security;
-- Intentionally NO policies: service-role-only.

-- Idempotency: tag each imported row with its Plaid transaction id so re-syncs
-- never double-post, and removed transactions can be deleted by id.
alter table public.deposits          add column if not exists plaid_txn_id text;
alter table public.checking_expenses add column if not exists plaid_txn_id text;
alter table public.cc_transactions    add column if not exists plaid_txn_id text;

create unique index if not exists deposits_plaid_txn_uniq          on public.deposits (plaid_txn_id)          where plaid_txn_id is not null;
create unique index if not exists checking_expenses_plaid_txn_uniq on public.checking_expenses (plaid_txn_id) where plaid_txn_id is not null;
create unique index if not exists cc_transactions_plaid_txn_uniq    on public.cc_transactions (plaid_txn_id)    where plaid_txn_id is not null;

notify pgrst, 'reload schema';
