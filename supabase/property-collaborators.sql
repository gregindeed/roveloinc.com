-- ============================================================================
-- roveloinc.com — Per-property collaborators
-- Lets an owner/manager grant a third-party manager access to ONE property.
-- Access is ADDITIVE on top of the existing client-level model (access.sql /
-- memberships.sql): a per-property grant never removes existing access — it only
-- adds a narrow path to a single property's rows.
-- Run AFTER properties.sql, property-tenants-docs.sql, property-applications.sql,
-- and access.sql / memberships.sql. Idempotent — safe to re-run.
-- ============================================================================

-- 1. Grants ------------------------------------------------------------------
create table if not exists public.property_access (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  client_id   uuid not null references public.clients(id) on delete cascade,   -- the property's owner (scope for managing the list)
  user_id     uuid references auth.users(id) on delete cascade,                -- null until the invite is accepted
  email       text not null,
  name        text,
  role        text not null default 'manager' check (role in ('manager','viewer')),
  status      text not null default 'invited' check (status in ('invited','active','removed')),
  token       text not null unique,
  invited_by  uuid references auth.users(id) on delete set null,
  invited_at  timestamptz not null default now(),
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists property_access_property_idx on public.property_access(property_id);
create index if not exists property_access_user_idx     on public.property_access(user_id);
create unique index if not exists property_access_prop_email_uniq on public.property_access(property_id, lower(email));
alter table public.property_access enable row level security;

-- 2. Helpers (SECURITY DEFINER → run as owner, so no RLS recursion) -----------
create or replace function public.has_property_access(pid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.property_access pa
    where pa.property_id = pid and pa.user_id = auth.uid() and pa.status = 'active'
  );
$$;

create or replace function public.property_owner(pid uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select client_id from public.properties where id = pid;
$$;

create or replace function public.lease_property(lid uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select property_id from public.leases where id = lid;
$$;

-- 3. property_access policies ------------------------------------------------
-- Only client-level managers (owner / manager / granted collaborator) manage the
-- list — per-property collaborators cannot invite others. A user always reads
-- their own grants.
drop policy if exists property_access_manage on public.property_access;
drop policy if exists property_access_self   on public.property_access;
create policy property_access_manage on public.property_access for all
  using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));
create policy property_access_self on public.property_access for select
  using (user_id = auth.uid());

-- 4. Additive RLS on the property tables -------------------------------------
--    Each policy = the existing client-level rule OR a per-property grant.

-- properties (scope = id)
drop policy if exists properties_write on public.properties;
drop policy if exists properties_read  on public.properties;
create policy properties_write on public.properties for all
  using (public.can_write_entity(client_id) or public.has_property_access(id))
  with check (public.can_write_entity(client_id) or public.has_property_access(id));
create policy properties_read on public.properties for select
  using (public.can_read_entity(client_id) or public.has_property_access(id));

-- units (property_id)
drop policy if exists units_write on public.units;
drop policy if exists units_read  on public.units;
create policy units_write on public.units for all
  using (public.can_write_entity(client_id) or public.has_property_access(property_id))
  with check (public.can_write_entity(client_id) or public.has_property_access(property_id));
create policy units_read on public.units for select
  using (public.can_read_entity(client_id) or public.has_property_access(property_id));

-- leases (property_id)
drop policy if exists leases_write on public.leases;
drop policy if exists leases_read  on public.leases;
create policy leases_write on public.leases for all
  using (public.can_write_entity(client_id) or public.has_property_access(property_id))
  with check (public.can_write_entity(client_id) or public.has_property_access(property_id));
create policy leases_read on public.leases for select
  using (public.can_read_entity(client_id) or public.has_property_access(property_id));

-- rent_charges (reach the property via lease_id)
drop policy if exists rent_charges_write on public.rent_charges;
drop policy if exists rent_charges_read  on public.rent_charges;
create policy rent_charges_write on public.rent_charges for all
  using (public.can_write_entity(client_id) or public.has_property_access(public.lease_property(lease_id)))
  with check (public.can_write_entity(client_id) or public.has_property_access(public.lease_property(lease_id)));
create policy rent_charges_read on public.rent_charges for select
  using (public.can_read_entity(client_id) or public.has_property_access(public.lease_property(lease_id)));

-- rent_payments (via lease_id)
drop policy if exists rent_payments_write on public.rent_payments;
drop policy if exists rent_payments_read  on public.rent_payments;
create policy rent_payments_write on public.rent_payments for all
  using (public.can_write_entity(client_id) or public.has_property_access(public.lease_property(lease_id)))
  with check (public.can_write_entity(client_id) or public.has_property_access(public.lease_property(lease_id)));
create policy rent_payments_read on public.rent_payments for select
  using (public.can_read_entity(client_id) or public.has_property_access(public.lease_property(lease_id)));

-- tenant_profiles (via lease_id)
drop policy if exists tenant_profiles_write on public.tenant_profiles;
drop policy if exists tenant_profiles_read  on public.tenant_profiles;
create policy tenant_profiles_write on public.tenant_profiles for all
  using (public.can_write_entity(client_id) or public.has_property_access(public.lease_property(lease_id)))
  with check (public.can_write_entity(client_id) or public.has_property_access(public.lease_property(lease_id)));
create policy tenant_profiles_read on public.tenant_profiles for select
  using (public.can_read_entity(client_id) or public.has_property_access(public.lease_property(lease_id)));

-- property_documents (property_id)
drop policy if exists property_documents_write on public.property_documents;
drop policy if exists property_documents_read  on public.property_documents;
create policy property_documents_write on public.property_documents for all
  using (public.can_write_entity(client_id) or public.has_property_access(property_id))
  with check (public.can_write_entity(client_id) or public.has_property_access(property_id));
create policy property_documents_read on public.property_documents for select
  using (public.can_read_entity(client_id) or public.has_property_access(property_id));

-- tenant_messages (via lease_id; property_id may be null)
drop policy if exists tenant_messages_write on public.tenant_messages;
drop policy if exists tenant_messages_read  on public.tenant_messages;
create policy tenant_messages_write on public.tenant_messages for all
  using (public.can_write_entity(client_id) or public.has_property_access(public.lease_property(lease_id)))
  with check (public.can_write_entity(client_id) or public.has_property_access(public.lease_property(lease_id)));
create policy tenant_messages_read on public.tenant_messages for select
  using (public.can_read_entity(client_id) or public.has_property_access(public.lease_property(lease_id)));

-- rental_applications (property_id)
drop policy if exists rental_applications_write on public.rental_applications;
drop policy if exists rental_applications_read  on public.rental_applications;
create policy rental_applications_write on public.rental_applications for all
  using (public.can_write_entity(client_id) or public.has_property_access(property_id))
  with check (public.can_write_entity(client_id) or public.has_property_access(property_id));
create policy rental_applications_read on public.rental_applications for select
  using (public.can_read_entity(client_id) or public.has_property_access(property_id));

-- 5. A per-property collaborator may read the OWNER of their property (name only
--    matters, but the row is needed for joins). Additive SELECT policy → OR'd
--    with the existing clients_read.
drop policy if exists clients_property_collab_read on public.clients;
create policy clients_property_collab_read on public.clients for select
  using (exists (
    select 1 from public.property_access pa
    where pa.user_id = auth.uid() and pa.status = 'active' and pa.client_id = id
  ));

-- 6. Storage: per-property collaborators get objects under their property folder
--    path = <client_id>/property/<property_id>/...  →  [1]=client, [2]='property', [3]=property_id
drop policy if exists "client-docs property collab" on storage.objects;
create policy "client-docs property collab" on storage.objects for all
  using (bucket_id = 'client-docs' and exists (
    select 1 from public.property_access pa
    where pa.user_id = auth.uid() and pa.status = 'active'
      and (storage.foldername(name))[2] = 'property'
      and (storage.foldername(name))[3] = pa.property_id::text))
  with check (bucket_id = 'client-docs' and exists (
    select 1 from public.property_access pa
    where pa.user_id = auth.uid() and pa.status = 'active'
      and (storage.foldername(name))[2] = 'property'
      and (storage.foldername(name))[3] = pa.property_id::text));

notify pgrst, 'reload schema';
