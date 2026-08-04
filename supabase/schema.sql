-- ============================================================================
-- roveloinc.com — Supabase schema, security policies, and seed
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query).
-- It is safe to run on a fresh project. See the BOOTSTRAP notes at the bottom
-- for creating the first admin and linking the Reyes client login.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------- Roles ----------
do $$ begin
  create type public.user_role as enum ('admin', 'client');
exception when duplicate_object then null; end $$;

-- ---------- Tenants (bookkeeping clients) ----------
create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  legal_name  text,
  owner_name  text,
  address     text,
  created_at  timestamptz not null default now()
);

-- ---------- Profiles: one row per auth user ----------
-- Links a Supabase Auth user to a role and (for clients) to their client.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       public.user_role not null default 'client',
  client_id  uuid references public.clients(id) on delete set null,
  full_name  text,
  created_at timestamptz not null default now()
);

-- ---------- Financial data (all scoped by client_id) ----------
create table if not exists public.deposits (
  id         bigint generated always as identity primary key,
  client_id  uuid not null references public.clients(id) on delete cascade,
  txn_date   date not null,
  description text not null,
  type       text,
  category   text,
  amount     numeric(12,2) not null
);

create table if not exists public.checking_expenses (
  id         bigint generated always as identity primary key,
  client_id  uuid not null references public.clients(id) on delete cascade,
  txn_date   date not null,
  check_num  text,
  description text not null,
  category   text,
  amount     numeric(12,2) not null
);

create table if not exists public.cc_transactions (
  id         bigint generated always as identity primary key,
  client_id  uuid not null references public.clients(id) on delete cascade,
  post_date  date not null,
  txn_date   date not null,
  account    text,
  description text not null,
  category   text,
  amount     numeric(12,2) not null,
  personal   boolean not null default false
);

create index if not exists deposits_client_idx          on public.deposits(client_id);
create index if not exists checking_expenses_client_idx on public.checking_expenses(client_id);
create index if not exists cc_transactions_client_idx   on public.cc_transactions(client_id);

-- ---------- Helper functions (SECURITY DEFINER avoids RLS recursion) ----------
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.current_client_id()
returns uuid language sql security definer stable set search_path = public as $$
  select client_id from public.profiles where id = auth.uid();
$$;

-- Auto-create a profile whenever a new auth user is created (defaults to 'client').
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Row-Level Security ----------
alter table public.clients            enable row level security;
alter table public.profiles           enable row level security;
alter table public.deposits           enable row level security;
alter table public.checking_expenses  enable row level security;
alter table public.cc_transactions    enable row level security;

-- profiles: a user sees their own profile; admins see all; only admins write.
drop policy if exists profiles_read  on public.profiles;
drop policy if exists profiles_write on public.profiles;
create policy profiles_read  on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_write on public.profiles for all    using (public.is_admin()) with check (public.is_admin());

-- clients: admins manage all; a client can read only its own client row.
drop policy if exists clients_admin_all on public.clients;
drop policy if exists clients_own_read  on public.clients;
create policy clients_admin_all on public.clients for all    using (public.is_admin()) with check (public.is_admin());
create policy clients_own_read  on public.clients for select using (id = public.current_client_id());

-- financial tables: admins manage all; clients get READ-ONLY of their own rows.
-- (No client insert/update/delete policy = clients cannot modify anything.)
drop policy if exists deposits_admin_all       on public.deposits;
drop policy if exists deposits_client_read      on public.deposits;
create policy deposits_admin_all  on public.deposits for all    using (public.is_admin()) with check (public.is_admin());
create policy deposits_client_read on public.deposits for select using (client_id = public.current_client_id());

drop policy if exists checking_admin_all  on public.checking_expenses;
drop policy if exists checking_client_read on public.checking_expenses;
create policy checking_admin_all  on public.checking_expenses for all    using (public.is_admin()) with check (public.is_admin());
create policy checking_client_read on public.checking_expenses for select using (client_id = public.current_client_id());

drop policy if exists cc_admin_all  on public.cc_transactions;
drop policy if exists cc_client_read on public.cc_transactions;
create policy cc_admin_all  on public.cc_transactions for all    using (public.is_admin()) with check (public.is_admin());
create policy cc_client_read on public.cc_transactions for select using (client_id = public.current_client_id());

-- ============================================================================
-- SEED
-- ============================================================================

-- Reyes Tires Inc tenant (fixed id so the seed rows below can reference it)
insert into public.clients (id, slug, name, legal_name, owner_name, address)
values ('11111111-1111-1111-1111-111111111111', 'reyes-tires-inc', 'Reyes Tires Inc',
        'Reyes Tires Inc', 'Francisco Reyes', '8637 Troy St, Spring Valley, CA 91977')
on conflict (id) do nothing;

-- Reyes Tires Inc — seed rows (generated from app/reyes-tires-inc/data.ts)
insert into public.deposits (client_id, txn_date, description, type, category, amount) values
  ('11111111-1111-1111-1111-111111111111', '2026-04-01', 'EPX Merchant Settlement', 'EPX Settlement', 'Sales - Card Payments', 870.01),
  ('11111111-1111-1111-1111-111111111111', '2026-04-01', 'Zelle - Sandra Castillo', 'Zelle Received', 'Sales - Zelle Payments', 840.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-02', 'EPX Merchant Settlement', 'EPX Settlement', 'Sales - Card Payments', 730.01),
  ('11111111-1111-1111-1111-111111111111', '2026-04-02', 'Zelle - Julien Kenderson', 'Zelle Received', 'Sales - Zelle Payments', 300.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-02', 'Zelle - Cam DX Corp', 'Zelle Received', 'Sales - Zelle Payments', 150.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-03', 'EPX Merchant Settlement', 'EPX Settlement', 'Sales - Card Payments', 715.02),
  ('11111111-1111-1111-1111-111111111111', '2026-04-03', 'Zelle - Zamora Valenzuela', 'Zelle Received', 'Sales - Zelle Payments', 240.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-06', 'Mobile Check Deposit', 'Check Deposit', 'Sales - Check Payments', 3160.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-06', 'Zelle - Farhat Mojaddidi', 'Zelle Received', 'Sales - Zelle Payments', 2050.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-06', 'Zelle - Yusuf Anas', 'Zelle Received', 'Sales - Zelle Payments', 870.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-06', 'EPX Merchant Settlement', 'EPX Settlement', 'Sales - Card Payments', 635.01),
  ('11111111-1111-1111-1111-111111111111', '2026-04-06', 'Zelle - Direct Autohaus', 'Zelle Received', 'Sales - Zelle Payments', 320.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-06', 'EPX Merchant Settlement', 'EPX Settlement', 'Sales - Card Payments', 180.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-07', 'EPX Merchant Settlement', 'EPX Settlement', 'Sales - Card Payments', 545.02),
  ('11111111-1111-1111-1111-111111111111', '2026-04-07', 'Zelle - Carlos Escobar Padron', 'Zelle Received', 'Sales - Zelle Payments', 240.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-08', 'EPX Merchant Settlement', 'EPX Settlement', 'Sales - Card Payments', 75.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-09', 'EPX Merchant Settlement', 'EPX Settlement', 'Sales - Card Payments', 75.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-10', 'Amazon Refund', 'Refund', 'Other - Refund', 387.37),
  ('11111111-1111-1111-1111-111111111111', '2026-04-13', 'Mobile Check Deposit', 'Check Deposit', 'Sales - Check Payments', 1320.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-13', 'EPX Merchant Settlement', 'EPX Settlement', 'Sales - Card Payments', 435.01),
  ('11111111-1111-1111-1111-111111111111', '2026-04-14', 'Return of Posted Check', 'Bank Return', 'Non-Operating - Bank Return', 1976.32),
  ('11111111-1111-1111-1111-111111111111', '2026-04-14', 'Overdraft Protection Transfer', 'Bank Transfer', 'Non-Operating - Transfer', 557.31),
  ('11111111-1111-1111-1111-111111111111', '2026-04-14', 'EPX Merchant Settlement', 'EPX Settlement', 'Sales - Card Payments', 4310.13),
  ('11111111-1111-1111-1111-111111111111', '2026-04-15', 'EPX Merchant Settlement', 'EPX Settlement', 'Sales - Card Payments', 815.02),
  ('11111111-1111-1111-1111-111111111111', '2026-04-15', 'Zelle - Cam DX Corp', 'Zelle Received', 'Sales - Zelle Payments', 200.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-16', 'EPX Merchant Settlement', 'EPX Settlement', 'Sales - Card Payments', 420.01),
  ('11111111-1111-1111-1111-111111111111', '2026-04-17', 'Zelle - Marco Castrosanchez (VW Atlas oil change)', 'Zelle Received', 'Sales - Zelle Payments', 290.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-17', 'EPX Merchant Settlement', 'EPX Settlement', 'Sales - Card Payments', 280.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-20', 'EPX Merchant Settlement', 'EPX Settlement', 'Sales - Card Payments', 1570.04),
  ('11111111-1111-1111-1111-111111111111', '2026-04-20', 'EPX Merchant Settlement', 'EPX Settlement', 'Sales - Card Payments', 760.02),
  ('11111111-1111-1111-1111-111111111111', '2026-04-20', 'Zelle - Jorge Romero Pino', 'Zelle Received', 'Sales - Zelle Payments', 280.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-20', 'Zelle - Faisal Anas', 'Zelle Received', 'Sales - Zelle Payments', 70.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-20', 'Zelle - Carlos Calderon', 'Zelle Received', 'Sales - Zelle Payments', 60.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-21', 'Zelle - Direct Autohaus (BMW/Audi sensors)', 'Zelle Received', 'Sales - Zelle Payments', 350.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-21', 'EPX Merchant Settlement', 'EPX Settlement', 'Sales - Card Payments', 60.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-21', 'Zelle - Xdrive LLC', 'Zelle Received', 'Sales - Zelle Payments', 50.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-22', 'EPX Merchant Settlement', 'EPX Settlement', 'Sales - Card Payments', 775.01),
  ('11111111-1111-1111-1111-111111111111', '2026-04-23', 'EPX Merchant Settlement', 'EPX Settlement', 'Sales - Card Payments', 795.02),
  ('11111111-1111-1111-1111-111111111111', '2026-04-24', 'EPX Merchant Settlement', 'EPX Settlement', 'Sales - Card Payments', 1000.01),
  ('11111111-1111-1111-1111-111111111111', '2026-04-24', 'Zelle - Cam DX Corp', 'Zelle Received', 'Sales - Zelle Payments', 100.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-24', 'Zelle - Omar Zurita', 'Zelle Received', 'Sales - Zelle Payments', 50.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-27', 'EPX Merchant Settlement', 'EPX Settlement', 'Sales - Card Payments', 1950.06),
  ('11111111-1111-1111-1111-111111111111', '2026-04-27', 'EPX Merchant Settlement', 'EPX Settlement', 'Sales - Card Payments', 1433.03),
  ('11111111-1111-1111-1111-111111111111', '2026-04-27', 'Zelle - Victor Villegas', 'Zelle Received', 'Sales - Zelle Payments', 100.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-28', 'EPX Merchant Settlement', 'EPX Settlement', 'Sales - Card Payments', 1230.03),
  ('11111111-1111-1111-1111-111111111111', '2026-04-29', 'EPX Merchant Settlement', 'EPX Settlement', 'Sales - Card Payments', 1215.04),
  ('11111111-1111-1111-1111-111111111111', '2026-04-29', 'Zelle - Jorge Ruiz (Lincoln)', 'Zelle Received', 'Sales - Zelle Payments', 200.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-29', 'Zelle - Richard Prieto (tire patch)', 'Zelle Received', 'Sales - Zelle Payments', 70.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-29', 'Zelle - Julien Kenderson', 'Zelle Received', 'Sales - Zelle Payments', 60.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-30', 'EPX Merchant Settlement', 'EPX Settlement', 'Sales - Card Payments', 1060.02),
  ('11111111-1111-1111-1111-111111111111', '2026-04-30', 'Zelle - Motor Point LLC', 'Zelle Received', 'Sales - Zelle Payments', 200.00);

insert into public.checking_expenses (client_id, txn_date, check_num, description, category, amount) values
  ('11111111-1111-1111-1111-111111111111', '2026-04-01', NULL, 'Bank Monthly Maintenance Fee', 'Bank Fees', 16.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-01', NULL, 'Excess Transaction Fee', 'Bank Fees', 2.70),
  ('11111111-1111-1111-1111-111111111111', '2026-04-01', NULL, 'EPX Merchant Processing Fee', 'Merchant Processing', 10.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-01', NULL, 'ADP 401k Contribution', 'Payroll-401k', 30.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-01', NULL, 'ADP Pay-By-Pay (Workers Comp)', 'Payroll-Workers Comp', 86.75),
  ('11111111-1111-1111-1111-111111111111', '2026-04-01', '4064', 'Tire Network — Tire Purchase', 'Inventory-Tires', 600.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-01', '4066', 'U.S. Auto Force — Parts', 'Inventory-Parts & Supplies', 574.38),
  ('11111111-1111-1111-1111-111111111111', '2026-04-01', '4068', 'Tire Co — Tire Purchase', 'Inventory-Tires', 200.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-03', NULL, 'ADP Payroll Processing Fee', 'Payroll-Processing Fees', 118.50),
  ('11111111-1111-1111-1111-111111111111', '2026-04-03', NULL, 'ADP Payroll Processing Fee', 'Payroll-Processing Fees', 40.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-03', NULL, 'Toyota Financial — Vehicle Loan', 'Vehicle-Loan', 326.39),
  ('11111111-1111-1111-1111-111111111111', '2026-04-03', '4069', 'Tire Outlet — Tire Purchase', 'Inventory-Tires', 630.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-06', NULL, 'ADP Wage Pay — Payroll', 'Payroll-Wages', 1976.32),
  ('11111111-1111-1111-1111-111111111111', '2026-04-06', NULL, 'ADP Tax Deposit', 'Payroll-Payroll Taxes', 607.68),
  ('11111111-1111-1111-1111-111111111111', '2026-04-06', NULL, 'Zelle to Teo — Labor/Supply', 'Labor/Subcontractors', 200.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-06', NULL, 'Zelle to Juan Used Tires', 'Inventory-Tires', 700.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-06', NULL, 'Gladly Coffee', 'Meals/Entertainment', 27.10),
  ('11111111-1111-1111-1111-111111111111', '2026-04-06', '4070', 'Freedom — Parts Purchase', 'Inventory-Parts & Supplies', 479.40),
  ('11111111-1111-1111-1111-111111111111', '2026-04-07', NULL, 'ADP 401k Contribution', 'Payroll-401k', 30.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-07', NULL, 'ADP Pay-By-Pay (Workers Comp)', 'Payroll-Workers Comp', 166.69),
  ('11111111-1111-1111-1111-111111111111', '2026-04-07', NULL, 'FDMS Merchant Processing Fee', 'Merchant Processing', 4.95),
  ('11111111-1111-1111-1111-111111111111', '2026-04-07', NULL, 'LGND SOCAL', 'Miscellaneous', 130.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-08', NULL, 'CC Payment — Card 6514', 'Credit Card Payment', 1000.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-08', NULL, 'FDMS Merchant Processing Fee', 'Merchant Processing', 37.71),
  ('11111111-1111-1111-1111-111111111111', '2026-04-10', NULL, 'ADP Payroll Processing Fee', 'Payroll-Processing Fees', 134.50),
  ('11111111-1111-1111-1111-111111111111', '2026-04-10', '4040', 'U.S. Auto Force — Parts', 'Inventory-Parts & Supplies', 659.96),
  ('11111111-1111-1111-1111-111111111111', '2026-04-13', NULL, 'ADP Wage Pay — Payroll', 'Payroll-Wages', 1976.32),
  ('11111111-1111-1111-1111-111111111111', '2026-04-13', NULL, 'ADP Tax Deposit', 'Payroll-Payroll Taxes', 607.68),
  ('11111111-1111-1111-1111-111111111111', '2026-04-13', NULL, 'ADP 401k Contribution', 'Payroll-401k', 30.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-13', NULL, 'AT&T Phone', 'Utilities-Phone', 244.89),
  ('11111111-1111-1111-1111-111111111111', '2026-04-13', '4051', 'Tire Outlet — Tire Purchase', 'Inventory-Tires', 1816.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-13', '4061', 'Tire Outlet — Tire Purchase', 'Inventory-Tires', 1216.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-13', '4072', 'Basil Hosmer — Rent', 'Rent', 3400.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-13', '4073', 'Tire Outlet — Tire Purchase', 'Inventory-Tires', 1080.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-13', '4074', 'U.S. Auto Force — Parts', 'Inventory-Parts & Supplies', 120.12),
  ('11111111-1111-1111-1111-111111111111', '2026-04-13', '4075', 'GW — Labor', 'Labor/Subcontractors', 110.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-14', NULL, 'ADP Pay-By-Pay (Workers Comp)', 'Payroll-Workers Comp', 86.75),
  ('11111111-1111-1111-1111-111111111111', '2026-04-14', '4076', 'Tire Outlet — Tire Purchase', 'Inventory-Tires', 460.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-14', '4077', 'GW — Labor', 'Labor/Subcontractors', 150.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-15', NULL, 'ADP Wage Pay — Payroll', 'Payroll-Wages', 1976.32),
  ('11111111-1111-1111-1111-111111111111', '2026-04-16', NULL, 'TAPCO Insurance — Business Insurance', 'Insurance-Business', 1138.82),
  ('11111111-1111-1111-1111-111111111111', '2026-04-16', NULL, 'TimePaymentcorp — Equipment Lease', 'Equipment Lease', 741.95),
  ('11111111-1111-1111-1111-111111111111', '2026-04-16', '4078', 'Tire Parts — Parts Purchase', 'Inventory-Parts & Supplies', 152.31),
  ('11111111-1111-1111-1111-111111111111', '2026-04-17', NULL, 'ADP Payroll Processing Fee', 'Payroll-Processing Fees', 134.50),
  ('11111111-1111-1111-1111-111111111111', '2026-04-17', NULL, 'Gladly Coffee', 'Meals/Entertainment', 27.32),
  ('11111111-1111-1111-1111-111111111111', '2026-04-20', NULL, 'ADP Wage Pay — Payroll', 'Payroll-Wages', 1976.32),
  ('11111111-1111-1111-1111-111111111111', '2026-04-20', NULL, 'ADP Tax Deposit', 'Payroll-Payroll Taxes', 607.68),
  ('11111111-1111-1111-1111-111111111111', '2026-04-20', '4079', 'Tire Co — Tire Purchase', 'Inventory-Tires', 771.70),
  ('11111111-1111-1111-1111-111111111111', '2026-04-21', NULL, 'ADP 401k Contribution', 'Payroll-401k', 30.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-21', NULL, 'ADP Pay-By-Pay (Workers Comp)', 'Payroll-Workers Comp', 86.75),
  ('11111111-1111-1111-1111-111111111111', '2026-04-21', NULL, 'ADP Tax Deposit', 'Payroll-Payroll Taxes', 607.68),
  ('11111111-1111-1111-1111-111111111111', '2026-04-22', '4080', 'U.S. Auto Force — Parts', 'Inventory-Parts & Supplies', 153.76),
  ('11111111-1111-1111-1111-111111111111', '2026-04-22', '4081', 'Tireco — Tire Purchase', 'Inventory-Tires', 318.80),
  ('11111111-1111-1111-1111-111111111111', '2026-04-23', '4082', 'Tire Outlet — Tire Purchase', 'Inventory-Tires', 400.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-24', NULL, 'ADP Payroll Processing Fee', 'Payroll-Processing Fees', 134.50),
  ('11111111-1111-1111-1111-111111111111', '2026-04-27', NULL, 'ADP Wage Pay — Payroll', 'Payroll-Wages', 1976.32),
  ('11111111-1111-1111-1111-111111111111', '2026-04-27', NULL, 'ADP Tax Deposit', 'Payroll-Payroll Taxes', 607.68),
  ('11111111-1111-1111-1111-111111111111', '2026-04-27', NULL, 'Gladly Coffee', 'Meals/Entertainment', 5.39),
  ('11111111-1111-1111-1111-111111111111', '2026-04-27', '4083', 'Tire Network — Tire Purchase', 'Inventory-Tires', 120.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-28', NULL, 'ADP 401k Contribution', 'Payroll-401k', 30.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-28', NULL, 'ADP Pay-By-Pay (Workers Comp)', 'Payroll-Workers Comp', 86.75),
  ('11111111-1111-1111-1111-111111111111', '2026-04-28', NULL, 'Snapdragon Stadium', 'Meals/Entertainment', 35.56),
  ('11111111-1111-1111-1111-111111111111', '2026-04-28', '4085', 'Tire Network — Tire Purchase', 'Inventory-Tires', 228.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-29', NULL, 'SANDAG FasTrak — Toll', 'Transportation', 2.50),
  ('11111111-1111-1111-1111-111111111111', '2026-04-29', NULL, 'APG Wholesale — Parts', 'Inventory-Parts & Supplies', 415.80),
  ('11111111-1111-1111-1111-111111111111', '2026-04-29', NULL, 'BMW El Cajon — Vehicle Repair', 'Vehicle-Repairs', 133.52),
  ('11111111-1111-1111-1111-111111111111', '2026-04-29', '4071', 'Bureau of Auto Repair — License', 'Licenses/Permits', 250.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-29', '4087', 'Tire Co — Tire Purchase', 'Inventory-Tires', 276.84),
  ('11111111-1111-1111-1111-111111111111', '2026-04-30', '4088', 'U.S. Auto Force — Parts', 'Inventory-Parts & Supplies', 786.00),
  ('11111111-1111-1111-1111-111111111111', '2026-04-30', '4092', 'Owner Draw — Francisco Reyes', 'Owner Draw', 700.00);

insert into public.cc_transactions (client_id, post_date, txn_date, account, description, category, amount, personal) values
  ('11111111-1111-1111-1111-111111111111', '2026-04-01', '2026-04-01', '...0214', 'SDFC Team Gym', 'Personal - Gym', 46.08, true),
  ('11111111-1111-1111-1111-111111111111', '2026-04-03', '2026-04-02', '...0214', 'Apple.com', 'Personal - Subscriptions', 9.99, true),
  ('11111111-1111-1111-1111-111111111111', '2026-04-05', '2026-04-04', '...0214', 'SDFC Team Gym', 'Personal - Gym', 503.79, true),
  ('11111111-1111-1111-1111-111111111111', '2026-04-06', '2026-04-05', '...0214', 'Amazon Digital', 'Personal - Subscriptions', 12.99, true),
  ('11111111-1111-1111-1111-111111111111', '2026-04-07', '2026-04-06', '...0214', 'Amazon Digital', 'Personal - Subscriptions', 2.99, true),
  ('11111111-1111-1111-1111-111111111111', '2026-04-08', '2026-04-07', '...0214', 'Amazon Prime', 'Personal - Subscriptions', 16.15, true),
  ('11111111-1111-1111-1111-111111111111', '2026-04-09', '2026-04-08', '...0214', 'ESPN+', 'Personal - Subscriptions', 19.99, true),
  ('11111111-1111-1111-1111-111111111111', '2026-04-10', '2026-04-09', '...0214', 'Apple.com', 'Personal - Subscriptions', 22.98, true),
  ('11111111-1111-1111-1111-111111111111', '2026-04-11', '2026-04-10', '...0214', 'Amazon Digital', 'Personal - Subscriptions', 16.99, true),
  ('11111111-1111-1111-1111-111111111111', '2026-04-12', '2026-04-11', '...0214', 'Amazon Digital', 'Personal - Subscriptions', 2.99, true),
  ('11111111-1111-1111-1111-111111111111', '2026-04-14', '2026-04-13', '...0214', 'SDFC Team Gym', 'Personal - Gym', 432.33, true),
  ('11111111-1111-1111-1111-111111111111', '2026-04-15', '2026-04-14', '...0214', 'Amazon Digital', 'Personal - Subscriptions', 19.99, true),
  ('11111111-1111-1111-1111-111111111111', '2026-04-18', '2026-04-17', '...0214', 'Cox Communications', 'Utilities - Internet', 110.17, false),
  ('11111111-1111-1111-1111-111111111111', '2026-04-20', '2026-04-19', '...0214', 'Infinity Kat', 'Miscellaneous (Review)', 400.60, false),
  ('11111111-1111-1111-1111-111111111111', '2026-04-22', '2026-04-21', '...0214', 'A to Z Tax Firm', 'Professional Services - Tax Prep', 420.00, false),
  ('11111111-1111-1111-1111-111111111111', '2026-04-30', '2026-04-30', '...0214', 'Finance Charge', 'Finance Charges', 63.07, false),
  ('11111111-1111-1111-1111-111111111111', '2026-04-30', '2026-04-30', '...0539', 'Finance Charge', 'Finance Charges', 51.72, false),
  ('11111111-1111-1111-1111-111111111111', '2026-04-15', '2026-04-14', '...6514', 'ADT Security Services', 'Security System', 98.08, false),
  ('11111111-1111-1111-1111-111111111111', '2026-04-30', '2026-04-30', '...6514', 'Finance Charge', 'Finance Charges', 96.97, false);
-- ============================================================================
-- BOOTSTRAP — do this after running everything above
-- ============================================================================
-- 1) Create your users in the Supabase dashboard:
--       Authentication → Users → Add user (set email + password).
--    Create one for yourself (admin) and one for the client (Reyes Tires).
--    A profile row is auto-created for each (role defaults to 'client').
--
-- 2) Promote yourself to admin — replace the email with yours:
--       update public.profiles set role = 'admin'
--       where id = (select id from auth.users where email = 'you@roveloinc.com');
--
-- 3) Link the client's login to the Reyes tenant — replace the email:
--       update public.profiles
--       set role = 'client',
--           client_id = '11111111-1111-1111-1111-111111111111'
--       where id = (select id from auth.users where email = 'client@reyestires.com');
--
-- After this, the admin login sees every client; the Reyes login sees only
-- Reyes' books, read-only, enforced by the database itself.
-- ============================================================================
