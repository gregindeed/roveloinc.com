-- ─────────────────────────────────────────────────────────────────────────────
-- entity_views — per-user "recently opened" history for the admin dashboard.
-- One row per (user, client); viewed_at is bumped each time the user opens the
-- entity. Private to each user via RLS. Safe to re-run.
-- (Already applied in production 2026-09-09.)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists entity_views (
  user_id   uuid        not null references auth.users(id) on delete cascade,
  client_id uuid        not null references clients(id)    on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (user_id, client_id)
);

create index if not exists entity_views_user_recent
  on entity_views (user_id, viewed_at desc);

alter table entity_views enable row level security;

drop policy if exists entity_views_select on entity_views;
create policy entity_views_select on entity_views
  for select using (user_id = auth.uid());

drop policy if exists entity_views_insert on entity_views;
create policy entity_views_insert on entity_views
  for insert with check (user_id = auth.uid());

drop policy if exists entity_views_update on entity_views;
create policy entity_views_update on entity_views
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists entity_views_delete on entity_views;
create policy entity_views_delete on entity_views
  for delete using (user_id = auth.uid());
