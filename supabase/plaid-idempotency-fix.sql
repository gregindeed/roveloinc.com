-- ── Fix: Plaid idempotency upsert vs. PARTIAL unique index ───────────────────
-- plaid.sql created PARTIAL unique indexes (… WHERE plaid_txn_id IS NOT NULL).
-- Postgres will only use a partial index as an ON CONFLICT arbiter when the
-- statement repeats the same WHERE predicate — which supabase-js's
-- `.upsert(rows, { onConflict: 'plaid_txn_id' })` does NOT emit. That makes the
-- Plaid sync upsert throw `42P10: no unique or exclusion constraint matching the
-- ON CONFLICT specification` at runtime.
--
-- Fix: replace each PARTIAL index with a FULL unique index on plaid_txn_id.
-- Postgres treats NULLs as distinct in a unique index, so the many manual /
-- statement-import rows (plaid_txn_id IS NULL) are still allowed without limit,
-- while ON CONFLICT (plaid_txn_id) now has a valid arbiter for the Plaid rows.
-- Run AFTER plaid.sql. Safe to re-run.

drop index if exists public.deposits_plaid_txn_uniq;
drop index if exists public.checking_expenses_plaid_txn_uniq;
drop index if exists public.cc_transactions_plaid_txn_uniq;

create unique index if not exists deposits_plaid_txn_uniq          on public.deposits (plaid_txn_id);
create unique index if not exists checking_expenses_plaid_txn_uniq on public.checking_expenses (plaid_txn_id);
create unique index if not exists cc_transactions_plaid_txn_uniq    on public.cc_transactions (plaid_txn_id);

notify pgrst, 'reload schema';
