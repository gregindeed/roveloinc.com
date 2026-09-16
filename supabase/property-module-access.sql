-- Property Management module access.
-- The module is OFF by default for every firm. A platform admin (or a firm's
-- owner) turns it on per firm via organizations.property_module. Separately,
-- anyone holding an active per-property grant (property_access) still gets in,
-- scoped to just their property — that path needs no firm flag. The gate that
-- reads this column lives in lib/propertyAccess.ts (nav + route guards).
--
-- Idempotent: safe to re-run.

alter table public.organizations
  add column if not exists property_module boolean not null default false;

notify pgrst, 'reload schema';
