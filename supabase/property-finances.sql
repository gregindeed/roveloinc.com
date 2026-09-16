-- ============================================================================
-- roveloinc.com — Property finances: operating expenses (feed the per-property P&L)
-- Income is already tracked (rent_payments); this adds the expense side so the
-- P&L tab can show income − expenses = net. The Overseer books bills here when
-- it reads a document; managers can also add expenses by hand.
-- Run AFTER properties.sql, property-tenants-docs.sql, and property-collaborators.sql
-- (uses can_write_entity / can_read_entity and has_property_access). Idempotent.
-- ============================================================================

create table if not exists public.property_expenses (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,   -- RLS scope (owner)
  property_id  uuid not null references public.properties(id) on delete cascade,
  unit_id      uuid references public.units(id) on delete set null,             -- null = property-wide
  document_id  uuid references public.property_documents(id) on delete set null, -- source doc, if any
  category     text not null default 'other'
               check (category in ('water','gas','electric','internet','trash','utilities','repairs','maintenance','insurance','property_tax','hoa','management','mortgage_interest','landscaping','pest','cleaning','supplies','legal','other')),
  vendor       text,
  description  text,
  amount       numeric(14,2) not null,
  incurred_on  date not null default current_date,
  source       text not null default 'manual' check (source in ('manual','overseer')),
  notes        text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists property_expenses_property_idx on public.property_expenses(property_id);
create index if not exists property_expenses_client_idx   on public.property_expenses(client_id);
create index if not exists property_expenses_document_idx  on public.property_expenses(document_id);
create index if not exists property_expenses_date_idx      on public.property_expenses(incurred_on);

alter table public.property_expenses enable row level security;

-- Additive RLS: client-level access OR a per-property collaborator grant.
drop policy if exists property_expenses_write on public.property_expenses;
drop policy if exists property_expenses_read  on public.property_expenses;
create policy property_expenses_write on public.property_expenses for all
  using (public.can_write_entity(client_id) or public.has_property_access(property_id))
  with check (public.can_write_entity(client_id) or public.has_property_access(property_id));
create policy property_expenses_read on public.property_expenses for select
  using (public.can_read_entity(client_id) or public.has_property_access(property_id));

notify pgrst, 'reload schema';
