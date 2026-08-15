-- ── Entity System Registry ───────────────────────────────────────────────────
-- The authoritative, append-only record of what's been acknowledged about an
-- entity: its genesis, what the Overseer has figured out, what the operator has
-- confirmed, and the durable standing facts (penalties, plans, history) that
-- give the whole company its context. It's the narrative source of truth that
-- sits alongside the numeric Entity State — the compass. Entries are attributed
-- (system / overseer / operator) so verified truth reads apart from AI guesses,
-- and "standing facts" can be pinned so they never scroll away and are always
-- fed to the Overseer. Run AFTER access.sql / memberships.sql. Re-runnable.

create table if not exists public.entity_log (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  at         timestamptz not null default now(),
  kind       text not null,                 -- genesis|context|learned|verified|signal|proposal|obligation|filing|document|lifecycle|note|fact
  source     text not null,                 -- system | overseer | operator
  actor      text not null default 'System',-- display label: 'Overseer', 'System', or an operator email
  title      text not null,
  detail     text,
  meta       jsonb,
  pinned     boolean not null default false, -- standing fact: always shown + always fed to the Overseer
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists entity_log_client_at_idx on public.entity_log (client_id, at desc);
create index if not exists entity_log_pinned_idx     on public.entity_log (client_id, pinned);
alter table public.entity_log enable row level security;

drop policy if exists entity_log_read  on public.entity_log;
drop policy if exists entity_log_write on public.entity_log;
create policy entity_log_read  on public.entity_log for select using (public.can_read_entity(client_id));
create policy entity_log_write on public.entity_log for all
  using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));

notify pgrst, 'reload schema';
