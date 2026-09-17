-- Firms get a @handle and avatar, so a firm can be referenced (tagged) with the
-- same avatar + handle affordance as a person. Both are optional; handle is
-- backfilled from the slug so existing firms have one immediately.
-- Idempotent: safe to re-run.

alter table public.organizations add column if not exists handle     text;
alter table public.organizations add column if not exists avatar_url text;

-- Backfill a handle from the slug (letters/digits only) where none is set.
update public.organizations
   set handle = regexp_replace(coalesce(slug, ''), '[^a-z0-9]', '', 'g')
 where handle is null and coalesce(slug, '') <> '';

notify pgrst, 'reload schema';
