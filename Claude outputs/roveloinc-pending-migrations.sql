-- ============================================================
-- roveloinc.com — pending property-module migrations
-- Run this whole block once in the Supabase SQL editor BEFORE deploying.
-- Both files are idempotent — safe to re-run.
-- ============================================================

-- ===== property-tenants-docs.sql (tenant profiles, documents, messages; doc kinds + sort_order) =====

-- ============================================================================
-- roveloinc.com — Property management, Phase 2 (run in the Supabase SQL editor)
-- Run AFTER properties.sql (needs public.properties / units / leases and the
-- helper functions can_write_entity / can_read_entity).
--
-- Adds:
--   • tenant_profiles   — the full tenant record (DOB, address, employer,
--                         income, emergency contact, SSN encrypted at rest).
--   • property_documents — files (lease agreements, IDs, applications, …)
--                         attached to a property / unit / lease, with room for
--                         the Overseer's extraction (ai_fields).
-- Files live in the existing 'client-docs' storage bucket under
--   <client_id>/property/<property_id>/<file>
-- so the storage RLS from documents.sql already covers them.
--
-- Safe to re-run.
-- ============================================================================

-- ── tenant_profiles (one per lease) ─────────────────────────────────────────
-- SSN is stored ENCRYPTED (ssn_enc, AES-256-GCM via lib/crypto + PLAID_TOKEN_KEY);
-- ssn_last4 is kept in clear for display only. Never store the full SSN in clear.
create table if not exists public.tenant_profiles (
  id                      uuid primary key default gen_random_uuid(),
  client_id               uuid not null references public.clients(id) on delete cascade, -- RLS scope (landlord)
  lease_id                uuid not null references public.leases(id) on delete cascade,
  dob                     date,
  current_address         text,
  employer                text,
  monthly_income          numeric(12,2),
  emergency_contact_name  text,
  emergency_contact_phone text,
  id_type                 text,                     -- drivers_license | passport | state_id | other
  ssn_enc                 text,                     -- encrypted full SSN (ciphertext)
  ssn_last4               text,                     -- last 4 digits, for display
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (lease_id)
);
create index if not exists tenant_profiles_client_idx on public.tenant_profiles(client_id);

-- ── property_documents ──────────────────────────────────────────────────────
create table if not exists public.property_documents (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,  -- RLS scope
  property_id  uuid not null references public.properties(id) on delete cascade,
  unit_id      uuid references public.units(id) on delete set null,
  lease_id     uuid references public.leases(id) on delete set null,
  name         text not null,
  storage_path text not null unique,                -- within the 'client-docs' bucket
  content_type text,
  size_bytes   bigint,
  doc_kind     text not null default 'other'
               check (doc_kind in ('photo','lease_agreement','id','application','insurance','inspection','tax','statement','receipt','invoice','notice','other')),
  uploaded_by  uuid references auth.users(id) on delete set null,
  ai_status    text,                                -- null | pending | parsed | failed
  ai_summary   text,
  ai_fields    jsonb,                               -- the Overseer's structured extraction
  sort_order   integer not null default 0,          -- manual photo arrangement (lower = earlier; hero is the lowest)
  created_at   timestamptz not null default now()
);
create index if not exists property_documents_property_idx on public.property_documents(property_id);
create index if not exists property_documents_client_idx   on public.property_documents(client_id);
-- Idempotent: widen the doc_kind check to include photos and the generated
-- billing documents (statement / receipt / invoice / notice) on an existing table.
alter table public.property_documents drop constraint if exists property_documents_doc_kind_check;
alter table public.property_documents add constraint property_documents_doc_kind_check
  check (doc_kind in ('photo','lease_agreement','id','application','insurance','inspection','tax','statement','receipt','invoice','notice','other'));
-- Idempotent: manual photo arrangement column on an existing table.
alter table public.property_documents add column if not exists sort_order integer not null default 0;

-- ── RLS (mirrors documents / access.sql) ────────────────────────────────────
alter table public.tenant_profiles    enable row level security;
alter table public.property_documents enable row level security;

drop policy if exists tenant_profiles_write on public.tenant_profiles;
drop policy if exists tenant_profiles_read  on public.tenant_profiles;
create policy tenant_profiles_write on public.tenant_profiles for all    using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));
create policy tenant_profiles_read  on public.tenant_profiles for select using (public.can_read_entity(client_id));

drop policy if exists property_documents_write on public.property_documents;
drop policy if exists property_documents_read  on public.property_documents;
create policy property_documents_write on public.property_documents for all    using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));
create policy property_documents_read  on public.property_documents for select using (public.can_read_entity(client_id));

-- ── tenant_messages (Phase 4 — the message thread per lease) ─────────────────
-- Outbound emails to the tenant (channel 'email') and manually-logged received
-- notes (channel 'note') both live here, so a lease has one running thread.
create table if not exists public.tenant_messages (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,  -- RLS scope
  lease_id    uuid not null references public.leases(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  unit_id     uuid references public.units(id) on delete set null,
  direction   text not null default 'outbound' check (direction in ('outbound','inbound')),
  channel     text not null default 'email'    check (channel in ('email','note','sms')),
  subject     text,
  body        text not null,
  to_email    text,
  sent_by     uuid references auth.users(id) on delete set null,
  status      text not null default 'sent'     check (status in ('sent','failed','logged')),
  created_at  timestamptz not null default now()
);
create index if not exists tenant_messages_lease_idx  on public.tenant_messages(lease_id);
create index if not exists tenant_messages_client_idx on public.tenant_messages(client_id);

alter table public.tenant_messages enable row level security;
drop policy if exists tenant_messages_write on public.tenant_messages;
drop policy if exists tenant_messages_read  on public.tenant_messages;
create policy tenant_messages_write on public.tenant_messages for all    using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));
create policy tenant_messages_read  on public.tenant_messages for select using (public.can_read_entity(client_id));

notify pgrst, 'reload schema';


-- ===== property-applications.sql (rental applications) =====

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
