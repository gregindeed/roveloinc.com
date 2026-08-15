-- ── Entity State (persisted readiness object) ────────────────────────────────
-- One derived record per entity: the readiness picture the Overseer maintains.
-- It's recomputed from data we already store (identity fields, documents,
-- statement coverage, compliance events) and written here so it can be trended,
-- sorted, and alerted on later. Run AFTER access.sql / memberships.sql (needs the
-- can_read_entity / can_write_entity helpers). Safe to re-run.

create table if not exists public.entity_state (
  client_id        uuid primary key references public.clients(id) on delete cascade,
  overall          int not null default 0,
  identity         jsonb not null default '{}'::jsonb,
  documents        jsonb not null default '{}'::jsonb,
  financial        jsonb not null default '{}'::jsonb,
  compliance       jsonb not null default '{}'::jsonb,
  open_actions     jsonb not null default '[]'::jsonb,
  last_evidence_at timestamptz,
  computed_at      timestamptz not null default now()
);

alter table public.entity_state enable row level security;

drop policy if exists entity_state_read  on public.entity_state;
drop policy if exists entity_state_write on public.entity_state;
create policy entity_state_read  on public.entity_state for select using (public.can_read_entity(client_id));
create policy entity_state_write on public.entity_state for all
  using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));

notify pgrst, 'reload schema';
