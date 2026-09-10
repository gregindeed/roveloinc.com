-- ============================================================================
-- roveloinc.com — Property management (run in the Supabase SQL editor)
-- Run AFTER schema.sql, documents.sql, and access.sql (needs the helper
-- functions public.is_admin(), public.current_client_id(),
-- public.can_write_entity(uuid), public.can_read_entity(uuid)).
--
-- A parallel, lightweight property-management subledger. Everything hangs off
-- an existing client entity (the LANDLORD / owner) via client_id, so it reuses
-- the same tenant scoping, RLS, and portal-client read access as the rest of
-- the app:
--
--   client (landlord)
--     └── property            a building / address  (+ how tenants pay)
--           └── unit          a rentable space (a whole SFR is one unit)
--                 └── lease   a tenancy: who rents it, for how much
--                       └── rent_charge     one month's rent line (INV-… number)
--                             └── rent_payment   a receipt (RCPT-… number)
--
-- Safe to re-run.
-- ============================================================================

-- ── properties ──────────────────────────────────────────────────────────────
create table if not exists public.properties (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  org_id      uuid references public.organizations(id) on delete set null,
  name        text not null,                       -- display name ("Maple Duplex")
  address     text,                                 -- formatted address (Google-sourced or manual)
  place_id    text,                                 -- Google Places id (stable handle for the location)
  lat         numeric(9,6),                         -- geocoded latitude
  lng         numeric(9,6),                         -- geocoded longitude
  type        text not null default 'residential'  -- residential | commercial | mixed | land
              check (type in ('residential','commercial','mixed','land')),
  notes       text,
  -- How tenants pay — shown on invoices, reminders, and receipts. Any subset.
  pay_zelle   text,                                -- Zelle email / phone
  pay_bank    text,                                -- bank / ACH deposit instructions
  pay_check   text,                                -- check payable-to + mailing address
  pay_other   text,                                -- anything else (portal, cash office, …)
  -- Automated rent reminders (sent by the daily cron).
  auto_reminders    boolean not null default true,
  reminder_lead_days integer not null default 5,   -- send the first reminder N days before due
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists properties_client_idx on public.properties(client_id);
-- Idempotent upgrades (safe if an earlier version of this table already exists).
alter table public.properties add column if not exists pay_zelle text;
alter table public.properties add column if not exists pay_bank  text;
alter table public.properties add column if not exists pay_check text;
alter table public.properties add column if not exists pay_other text;
alter table public.properties add column if not exists auto_reminders boolean not null default true;
alter table public.properties add column if not exists reminder_lead_days integer not null default 5;
alter table public.properties add column if not exists place_id text;
alter table public.properties add column if not exists lat numeric(9,6);
alter table public.properties add column if not exists lng numeric(9,6);

-- ── units ───────────────────────────────────────────────────────────────────
create table if not exists public.units (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  client_id   uuid not null references public.clients(id) on delete cascade, -- denormalized for RLS
  label       text not null default 'Unit',        -- "A", "2B", "Main house"
  bedrooms    numeric(3,1),
  bathrooms   numeric(3,1),
  sqft        integer,
  market_rent numeric(12,2),
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists units_property_idx on public.units(property_id);
create index if not exists units_client_idx   on public.units(client_id);

-- ── leases (tenancies) ──────────────────────────────────────────────────────
create table if not exists public.leases (
  id             uuid primary key default gen_random_uuid(),
  unit_id        uuid not null references public.units(id) on delete cascade,
  property_id    uuid not null references public.properties(id) on delete cascade,
  client_id      uuid not null references public.clients(id) on delete cascade, -- denormalized for RLS
  tenant_name    text not null,
  tenant_email   text,
  tenant_phone   text,
  rent_amount    numeric(12,2) not null default 0,
  deposit_amount numeric(12,2),
  rent_due_day   integer not null default 1        -- day of month rent is due (1–28)
                 check (rent_due_day between 1 and 28),
  start_date     date,
  end_date       date,                             -- null = month-to-month / open
  status         text not null default 'active'    -- active | upcoming | ended
                 check (status in ('active','upcoming','ended')),
  notes          text,
  created_at     timestamptz not null default now()
);
create index if not exists leases_unit_idx     on public.leases(unit_id);
create index if not exists leases_client_idx   on public.leases(client_id);
create index if not exists leases_property_idx on public.leases(property_id);

-- ── Sequences for human-friendly, unique invoice + receipt numbers ──────────
-- Global monotonic sequences → INV-000123 / RCPT-000123. Uniqueness is what
-- matters; they don't reset per year.
create sequence if not exists public.rent_invoice_seq;
create sequence if not exists public.rent_receipt_seq;

-- ── rent_charges (the monthly payment tracker; one INVOICE per month) ────────
create table if not exists public.rent_charges (
  id             uuid primary key default gen_random_uuid(),
  lease_id       uuid not null references public.leases(id) on delete cascade,
  unit_id        uuid not null references public.units(id) on delete cascade,
  client_id      uuid not null references public.clients(id) on delete cascade, -- denormalized for RLS
  invoice_number text not null default ('INV-' || lpad(nextval('public.rent_invoice_seq')::text, 6, '0')),
  period_month   date not null,                     -- first of the month this charge covers
  due_date       date not null,
  amount_due     numeric(12,2) not null default 0,
  amount_paid    numeric(12,2) not null default 0,
  paid_date      date,
  status         text not null default 'due'        -- due | partial | paid | overdue | waived
                 check (status in ('due','partial','paid','overdue','waived')),
  method         text,                              -- last payment method (cash|check|ach|card|zelle|other)
  reference      text,                              -- last payment reference (check #, memo)
  last_reminder_at timestamptz,                     -- when we last emailed a reminder
  reminder_count integer not null default 0,
  notes          text,
  created_at     timestamptz not null default now(),
  unique (lease_id, period_month)                   -- one rent line per lease per month
);
create index if not exists rent_charges_lease_idx  on public.rent_charges(lease_id);
create index if not exists rent_charges_client_idx on public.rent_charges(client_id);
create index if not exists rent_charges_period_idx on public.rent_charges(period_month);
create index if not exists rent_charges_due_idx    on public.rent_charges(due_date);
alter table public.rent_charges add column if not exists invoice_number text;
alter table public.rent_charges add column if not exists last_reminder_at timestamptz;
alter table public.rent_charges add column if not exists reminder_count integer not null default 0;
-- Backfill invoice numbers for any legacy rows (none on a fresh install).
update public.rent_charges
   set invoice_number = 'INV-' || lpad(nextval('public.rent_invoice_seq')::text, 6, '0')
 where invoice_number is null;

-- ── rent_payments (one RECEIPT per payment; supports partial payments) ───────
create table if not exists public.rent_payments (
  id             uuid primary key default gen_random_uuid(),
  charge_id      uuid not null references public.rent_charges(id) on delete cascade,
  lease_id       uuid not null references public.leases(id) on delete cascade,
  unit_id        uuid not null references public.units(id) on delete cascade,
  client_id      uuid not null references public.clients(id) on delete cascade, -- denormalized for RLS
  receipt_number text not null unique default ('RCPT-' || lpad(nextval('public.rent_receipt_seq')::text, 6, '0')),
  amount         numeric(12,2) not null default 0,
  paid_date      date not null default current_date,
  method         text,
  reference      text,
  notes          text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists rent_payments_charge_idx on public.rent_payments(charge_id);
create index if not exists rent_payments_client_idx on public.rent_payments(client_id);

-- ── Row-Level Security (mirrors documents / access.sql) ─────────────────────
-- Workers (owner/manager, or a granted collaborator) get full read+write on a
-- property whose owning entity they can work on; the portal client who owns the
-- entity gets read access to their own portfolio. Same helpers as every other
-- client-scoped table.
alter table public.properties    enable row level security;
alter table public.units         enable row level security;
alter table public.leases        enable row level security;
alter table public.rent_charges  enable row level security;
alter table public.rent_payments enable row level security;

drop policy if exists properties_write on public.properties;
drop policy if exists properties_read  on public.properties;
create policy properties_write on public.properties for all    using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));
create policy properties_read  on public.properties for select using (public.can_read_entity(client_id));

drop policy if exists units_write on public.units;
drop policy if exists units_read  on public.units;
create policy units_write on public.units for all    using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));
create policy units_read  on public.units for select using (public.can_read_entity(client_id));

drop policy if exists leases_write on public.leases;
drop policy if exists leases_read  on public.leases;
create policy leases_write on public.leases for all    using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));
create policy leases_read  on public.leases for select using (public.can_read_entity(client_id));

drop policy if exists rent_charges_write on public.rent_charges;
drop policy if exists rent_charges_read  on public.rent_charges;
create policy rent_charges_write on public.rent_charges for all    using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));
create policy rent_charges_read  on public.rent_charges for select using (public.can_read_entity(client_id));

drop policy if exists rent_payments_write on public.rent_payments;
drop policy if exists rent_payments_read  on public.rent_payments;
create policy rent_payments_write on public.rent_payments for all    using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));
create policy rent_payments_read  on public.rent_payments for select using (public.can_read_entity(client_id));

notify pgrst, 'reload schema';
