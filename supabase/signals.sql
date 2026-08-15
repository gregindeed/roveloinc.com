-- ── Detected signals (the evidence→conclusion loop) ──────────────────────────
-- The Overseer reads the transactions/documents already on file and records what
-- it can INFER — a payroll run, a CDTFA remittance, a tax payment — each with
-- provenance (which row it came from) and a confidence score. Two things then
-- happen automatically:
--   • a detected tax PAYMENT auto-marks the matching obligation event satisfied
--     (with a link back to the transaction), instead of a human clicking paid;
--   • detected activity the profile doesn't reflect (payroll but not enrolled for
--     EDD; sales-tax remittances but "collects sales tax" off) raises a PROPOSAL
--     the operator confirms or dismisses.
-- Run AFTER access.sql / memberships.sql / ledger.sql / compliance schema. Re-runnable.

create table if not exists public.detected_signals (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  type         text not null,               -- payroll_evidence | sales_tax_evidence | tax_payment | propose_*
  agency       text,                         -- cdtfa | ftb | edd | irs | ... when applicable
  summary      text not null,
  confidence   numeric not null default 0.7, -- 0..1
  source_table text not null,                -- deposits | checking_expenses | cc_transactions | document | proposal
  source_id    text not null,                -- row id, or the profile field for a proposal
  amount       numeric,
  txn_date     date,
  status       text not null default 'open', -- open | applied | dismissed
  proposed_action jsonb,                     -- e.g. {"field":"has_employees"}
  created_at   timestamptz not null default now(),
  unique (client_id, type, source_table, source_id)
);
create index if not exists detected_signals_client_idx on public.detected_signals (client_id);
create index if not exists detected_signals_status_idx on public.detected_signals (client_id, status);
alter table public.detected_signals enable row level security;

drop policy if exists detected_signals_read  on public.detected_signals;
drop policy if exists detected_signals_write on public.detected_signals;
create policy detected_signals_read  on public.detected_signals for select using (public.can_read_entity(client_id));
create policy detected_signals_write on public.detected_signals for all
  using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));

-- Provenance on obligation events: what evidence satisfied this filing, and was
-- it auto-matched (so the operator can tell it apart and undo it).
alter table public.obligation_events add column if not exists satisfied_by_txn text;
alter table public.obligation_events add column if not exists satisfied_by_doc uuid references public.documents(id) on delete set null;
alter table public.obligation_events add column if not exists satisfied_auto  boolean not null default false;

notify pgrst, 'reload schema';
