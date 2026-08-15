-- ── Audit P0 fixes ───────────────────────────────────────────────────────────
-- (2) Tighten the clients ROW policies so a scoped collaborator can't update the
--     entity's identity or delete the whole entity (which cascades to all books).
--     Transaction/table policies stay can_write_entity — collaborators still do
--     the bookkeeping; they just can't rewrite or delete the entity itself.
-- (8) Tag imported transactions with the statement_imports batch they came from,
--     so a re-import can be undone and duplicates identified.
-- Run AFTER access.sql / ledger.sql / statements.sql.

-- (2) clients row policies -----------------------------------------------------
drop policy if exists clients_write  on public.clients;
drop policy if exists clients_read   on public.clients;
drop policy if exists clients_insert on public.clients;
drop policy if exists clients_update on public.clients;
drop policy if exists clients_delete on public.clients;

create policy clients_read on public.clients for select
  using (public.can_read_entity(id));
create policy clients_insert on public.clients for insert
  with check (public.is_admin());
create policy clients_update on public.clients for update
  using (public.is_admin()) with check (public.is_admin());
create policy clients_delete on public.clients for delete
  using (public.is_owner());

-- (8) import batch tagging on the three transaction tables ---------------------
alter table public.deposits          add column if not exists import_id uuid references public.statement_imports(id) on delete set null;
alter table public.checking_expenses add column if not exists import_id uuid references public.statement_imports(id) on delete set null;
alter table public.cc_transactions    add column if not exists import_id uuid references public.statement_imports(id) on delete set null;

create index if not exists deposits_import_idx          on public.deposits (import_id);
create index if not exists checking_expenses_import_idx on public.checking_expenses (import_id);
create index if not exists cc_transactions_import_idx    on public.cc_transactions (import_id);

notify pgrst, 'reload schema';
