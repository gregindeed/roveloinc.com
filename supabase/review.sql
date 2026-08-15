-- ── Trust layer: field provenance + human review queue ───────────────────────
-- For a system that becomes the record of someone's taxes, extraction can't be
-- fire-and-forget. Two objects make it safe:
--   • entity_field_meta — per entity field: where its current value came from,
--     the confidence, and whether a HUMAN has verified it. A verified value is
--     never silently overwritten by a later AI guess.
--   • field_reviews — the escalation queue: low-confidence or conflicting
--     extractions wait here for a human to approve or reject, instead of being
--     auto-applied. The routine, high-confidence 90% flows straight through;
--     the risky 10% is escalated.
-- Run AFTER schema.sql / access.sql / memberships.sql / documents.sql. Re-runnable.

-- Persist the per-field confidence alongside the extracted values so the manual
-- "apply" path can also route through the trust rules, not just the on-upload one.
alter table public.documents add column if not exists ai_field_confidence jsonb;

create table if not exists public.entity_field_meta (
  client_id     uuid not null references public.clients(id) on delete cascade,
  field         text not null,
  source_doc_id uuid references public.documents(id) on delete set null,
  confidence    numeric,
  verified      boolean not null default false, -- human-confirmed / hand-entered
  updated_at    timestamptz not null default now(),
  primary key (client_id, field)
);
alter table public.entity_field_meta enable row level security;
drop policy if exists entity_field_meta_read  on public.entity_field_meta;
drop policy if exists entity_field_meta_write on public.entity_field_meta;
create policy entity_field_meta_read  on public.entity_field_meta for select using (public.can_read_entity(client_id));
create policy entity_field_meta_write on public.entity_field_meta for all
  using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));

create table if not exists public.field_reviews (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients(id) on delete cascade,
  field           text not null,
  proposed_value  text not null,
  current_value   text,
  confidence      numeric,
  source_doc_id   uuid references public.documents(id) on delete set null,
  source_doc_name text,
  reason          text,                          -- why it needs review (low_confidence | conflict | overwrites_verified)
  status          text not null default 'pending', -- pending | approved | rejected
  created_at      timestamptz not null default now(),
  decided_at      timestamptz
);
-- At most one PENDING review per field per entity (newest proposal supersedes).
create unique index if not exists field_reviews_pending_uniq
  on public.field_reviews (client_id, field) where status = 'pending';
create index if not exists field_reviews_client_idx on public.field_reviews (client_id, status);
alter table public.field_reviews enable row level security;
drop policy if exists field_reviews_read  on public.field_reviews;
drop policy if exists field_reviews_write on public.field_reviews;
create policy field_reviews_read  on public.field_reviews for select using (public.can_read_entity(client_id));
create policy field_reviews_write on public.field_reviews for all
  using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));

notify pgrst, 'reload schema';
