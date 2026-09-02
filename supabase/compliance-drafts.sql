-- ── Compliance drafts (the hybrid: AI proposes, a human confirms) ────────────
-- Our built-in templates cover California + federal. For any other state the
-- Overseer DRAFTS a filing calendar, stored UNVERIFIED so it never drives a
-- reminder or counts as overdue until a human confirms it. Confirmed drafts can
-- be promoted into a permanent, deterministic state template so the next entity
-- in that state doesn't need a fresh AI pass. Re-runnable.

-- The entity's home state (drives which state's calendar the Overseer drafts).
alter table public.clients            add column if not exists state       text;

alter table public.obligations       add column if not exists verified    boolean not null default true;
alter table public.obligations       add column if not exists source      text not null default 'manual'; -- manual | template | ai_draft
alter table public.obligations       add column if not exists draft_state text;
alter table public.obligation_events add column if not exists verified    boolean not null default true;

-- Rovelo-curated state template library (reused to skip re-drafting).
create table if not exists public.compliance_state_templates (
  id             uuid primary key default gen_random_uuid(),
  state          text not null,
  entity_type    text,                 -- null = applies to any type
  agency_label   text not null,        -- e.g. "Arizona Department of Revenue"
  kind           text not null,        -- stable slug, e.g. "az_tpt"
  label          text not null,        -- human filing name
  frequency      text not null,        -- monthly | quarterly | annual | biennial | one_time
  default_amount numeric,
  schedule       jsonb not null,       -- [{ period_label, month, day }]
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists cst_state_idx on public.compliance_state_templates (state, entity_type);
alter table public.compliance_state_templates enable row level security;
drop policy if exists cst_read  on public.compliance_state_templates;
drop policy if exists cst_write on public.compliance_state_templates;
create policy cst_read  on public.compliance_state_templates for select using (public.is_admin());
create policy cst_write on public.compliance_state_templates for all
  using (public.is_platform()) with check (public.is_platform());

notify pgrst, 'reload schema';
