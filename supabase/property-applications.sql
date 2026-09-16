-- ============================================================================
-- roveloinc.com — Property management, Phase 3 (run in the Supabase SQL editor)
-- Run AFTER properties.sql (needs properties / units / leases + the helper
-- functions can_write_entity / can_read_entity).
--
-- rental_applications — a prospective tenant's application. The manager creates
-- an invite (status 'invited') and emails a tokenized public link; the prospect
-- fills it out with NO login (the app server uses the service-role key, gated by
-- the unguessable token). On approval it's converted into a lease + tenant
-- profile. SSN is encrypted at rest (ssn_enc) exactly like tenant_profiles.
--
-- RLS below governs the MANAGER side (workers). The public submit path writes
-- with the service-role client, which bypasses RLS — so there is intentionally
-- no anon policy here.
--
-- Safe to re-run.
-- ============================================================================

create table if not exists public.rental_applications (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients(id) on delete cascade,   -- RLS scope (landlord)
  property_id    uuid not null references public.properties(id) on delete cascade,
  unit_id        uuid references public.units(id) on delete set null,
  token          text not null unique,                 -- public link capability
  status         text not null default 'invited'
                 check (status in ('invited','submitted','approved','declined','withdrawn')),
  invite_email   text,
  invited_by     uuid references auth.users(id) on delete set null,
  invited_at     timestamptz not null default now(),
  submitted_at   timestamptz,
  -- Applicant-provided fields (filled on the public form).
  full_name        text,
  email            text,
  phone            text,
  dob              date,
  current_address  text,
  employer         text,
  monthly_income   numeric(12,2),
  desired_move_in  date,
  occupants        integer,
  pets             text,
  vehicles         text,
  prior_landlord   text,
  references_text  text,
  ssn_enc          text,                                -- encrypted full SSN
  ssn_last4        text,                                -- last 4, for display
  consent_bg       boolean not null default false,      -- consent to background/credit check
  notes            text,
  created_at       timestamptz not null default now()
);
create index if not exists rental_applications_property_idx on public.rental_applications(property_id);
create index if not exists rental_applications_client_idx   on public.rental_applications(client_id);
create index if not exists rental_applications_token_idx    on public.rental_applications(token);

alter table public.rental_applications enable row level security;
drop policy if exists rental_applications_write on public.rental_applications;
drop policy if exists rental_applications_read  on public.rental_applications;
create policy rental_applications_write on public.rental_applications for all    using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));
create policy rental_applications_read  on public.rental_applications for select using (public.can_read_entity(client_id));

notify pgrst, 'reload schema';
