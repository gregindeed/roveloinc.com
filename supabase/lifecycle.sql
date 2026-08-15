-- ── Entity lifecycle & firm assignment ───────────────────────────────────────
-- Three independent states a client can carry:
--   • archived_at   — WE stopped working with them (reversible). Their books
--                     stay; they drop out of the active roster; their portal
--                     shows an "archived" notice instead of the books.
--   • dissolved_date— the real-world business no longer legally exists. Books
--                     stay as historical record; flagged dissolved.
--   • org_id        — which firm owns them. The platform firm (Rovelo) is the
--                     permanent parent and the default for anyone unassigned.
-- Permanent delete stays platform-only (memberships.sql: clients_delete =
-- is_platform). Archive/dissolve are ordinary row updates, so the existing
-- clients_update = is_firm_admin(org_id) policy already lets a firm's own
-- managers do them. Transfer changes org_id; the with-check on the NEW org
-- means only a platform admin can move a client into a firm they don't run.
-- Run AFTER firms.sql / memberships.sql. Safe to re-run.

alter table public.clients add column if not exists archived_at    timestamptz;
alter table public.clients add column if not exists dissolved_date date;

create index if not exists clients_archived_idx on public.clients (archived_at);

-- Every client belongs to a firm. Backfill anyone still unassigned to Rovelo so
-- nothing floats without a parent firm.
update public.clients
set org_id = (select id from public.organizations where is_platform = true order by created_at limit 1)
where org_id is null;

notify pgrst, 'reload schema';
