-- Documents & Sources: year folders + category filing
-- Safe to run more than once.

-- 1. File-level filing attributes on documents
alter table public.documents add column if not exists period_year int;
alter table public.documents add column if not exists folder text;

create index if not exists documents_client_year_folder_idx
  on public.documents (client_id, period_year, folder);

-- 2. Year folders (first-class so an empty year can exist before any files)
create table if not exists public.document_years (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  year       int  not null,
  created_at timestamptz not null default now(),
  unique (client_id, year)
);

alter table public.document_years enable row level security;

drop policy if exists "document_years admin all" on public.document_years;
create policy "document_years admin all"
  on public.document_years for all
  using (is_admin()) with check (is_admin());

drop policy if exists "document_years client read" on public.document_years;
create policy "document_years client read"
  on public.document_years for select
  using (client_id = current_client_id());
