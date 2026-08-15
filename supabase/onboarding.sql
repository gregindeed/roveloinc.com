-- ── Guided onboarding (interview, not a form) ────────────────────────────────
-- A draft workspace where an account is TAUGHT to Rovelo one answer at a time.
-- Nothing here is a real account yet — facts accumulate, attributed and (for AI-
-- derived ones later) confidence-scored, and only materialize into a real
-- clients row when the operator hits Create. This mirrors the trust model from
-- the review layer: facts / inference / confirmation stay separate from the
-- permanent config. Run AFTER firms.sql / memberships.sql. Re-runnable.

create table if not exists public.onboarding_sessions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  account_name text not null,
  status       text not null default 'in_progress', -- in_progress | completed | abandoned
  client_id    uuid references public.clients(id) on delete set null, -- set on materialize
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- The Overseer's opening read, generated on the review step and carried into the
-- real account so we don't pay for the synthesis twice.
alter table public.onboarding_sessions add column if not exists overseer_read     text;
alter table public.onboarding_sessions add column if not exists overseer_handling text;
create index if not exists onboarding_sessions_org_idx on public.onboarding_sessions (org_id, status);
alter table public.onboarding_sessions enable row level security;
drop policy if exists onboarding_sessions_rw on public.onboarding_sessions;
create policy onboarding_sessions_rw on public.onboarding_sessions for all
  using (public.is_firm_admin(org_id)) with check (public.is_firm_admin(org_id));

create table if not exists public.onboarding_facts (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.onboarding_sessions(id) on delete cascade,
  key              text not null,
  raw_value        text,
  normalized_value jsonb,
  source           text not null default 'user',  -- user | overseer | document
  confidence       numeric,
  confirmed        boolean not null default true,  -- user answers confirmed; AI-derived unconfirmed until confirmed
  created_at       timestamptz not null default now(),
  unique (session_id, key)
);
create index if not exists onboarding_facts_session_idx on public.onboarding_facts (session_id);
alter table public.onboarding_facts enable row level security;
drop policy if exists onboarding_facts_rw on public.onboarding_facts;
create policy onboarding_facts_rw on public.onboarding_facts for all
  using (exists (select 1 from public.onboarding_sessions s where s.id = session_id and public.is_firm_admin(s.org_id)))
  with check (exists (select 1 from public.onboarding_sessions s where s.id = session_id and public.is_firm_admin(s.org_id)));

notify pgrst, 'reload schema';
