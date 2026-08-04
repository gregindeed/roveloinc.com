-- ============================================================================
-- roveloinc.com — Document storage (run in the Supabase SQL editor)
-- Run AFTER schema.sql. Adds the documents table, a private storage bucket,
-- and Row-Level Security so each client can read/upload ONLY their own files.
-- The storage.* policies below require Supabase's storage schema (they will
-- not run on a plain Postgres) — run them in your Supabase project.
-- ============================================================================

-- ============================================================================
-- Documents metadata table + RLS
-- ============================================================================
create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  name          text not null,               -- original file name (for display)
  storage_path  text not null unique,        -- path within the 'client-docs' bucket
  content_type  text,
  size_bytes    bigint,
  uploaded_by   uuid references auth.users(id) on delete set null,
  uploaded_by_role public.user_role,
  created_at    timestamptz not null default now()
);

create index if not exists documents_client_idx on public.documents(client_id);

alter table public.documents enable row level security;

-- Admins: full access to every client's documents.
drop policy if exists documents_admin_all on public.documents;
create policy documents_admin_all on public.documents
  for all using (public.is_admin()) with check (public.is_admin());

-- Clients: read their own client's documents.
drop policy if exists documents_client_read on public.documents;
create policy documents_client_read on public.documents
  for select using (client_id = public.current_client_id());

-- Clients: upload (insert) documents into their own client, as themselves.
drop policy if exists documents_client_insert on public.documents;
create policy documents_client_insert on public.documents
  for insert with check (
    client_id = public.current_client_id() and uploaded_by = auth.uid()
  );

-- Clients: delete only documents they uploaded themselves.
drop policy if exists documents_client_delete on public.documents;
create policy documents_client_delete on public.documents
  for delete using (
    client_id = public.current_client_id() and uploaded_by = auth.uid()
  );
-- ============================================================================
-- Storage bucket for client documents + RLS on storage.objects
-- Files are stored under a folder named after the client's id:
--     <client_id>/<timestamp>-<filename>
-- so the first path segment identifies the owning client.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('client-docs', 'client-docs', false)
on conflict (id) do nothing;

-- Admins: full access to the whole bucket.
drop policy if exists "client-docs admin all" on storage.objects;
create policy "client-docs admin all" on storage.objects
  for all
  using (bucket_id = 'client-docs' and public.is_admin())
  with check (bucket_id = 'client-docs' and public.is_admin());

-- Clients: read files in their own client's folder.
drop policy if exists "client-docs client read" on storage.objects;
create policy "client-docs client read" on storage.objects
  for select
  using (
    bucket_id = 'client-docs'
    and (storage.foldername(name))[1] = public.current_client_id()::text
  );

-- Clients: upload files into their own client's folder.
drop policy if exists "client-docs client insert" on storage.objects;
create policy "client-docs client insert" on storage.objects
  for insert
  with check (
    bucket_id = 'client-docs'
    and (storage.foldername(name))[1] = public.current_client_id()::text
  );

-- Clients: delete files in their own client's folder.
drop policy if exists "client-docs client delete" on storage.objects;
create policy "client-docs client delete" on storage.objects
  for delete
  using (
    bucket_id = 'client-docs'
    and (storage.foldername(name))[1] = public.current_client_id()::text
  );
