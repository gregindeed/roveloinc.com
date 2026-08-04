-- ============================================================================
-- roveloinc.com — AI "Overseer" assessment cache
-- Run in the Supabase SQL editor. Idempotent.
-- ============================================================================
create table if not exists public.ai_assessments (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  scope      text not null,          -- 'overview' | 'compliance' | 'documents' | ...
  content    text not null,
  model      text,
  created_at timestamptz not null default now(),
  unique (client_id, scope)
);
create index if not exists ai_assessments_client_idx on public.ai_assessments(client_id);

alter table public.ai_assessments enable row level security;

drop policy if exists ai_admin_all   on public.ai_assessments;
drop policy if exists ai_client_read on public.ai_assessments;
create policy ai_admin_all  on public.ai_assessments for all
  using (public.is_admin()) with check (public.is_admin());
create policy ai_client_read on public.ai_assessments for select
  using (client_id = public.current_client_id());
