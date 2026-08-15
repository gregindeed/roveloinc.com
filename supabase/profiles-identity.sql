-- ── User identity (display name + avatar) ────────────────────────────────────
-- Per-user profile fields for the presence/avatar layer. Writes go through a
-- server action (service role, column-whitelisted) so a user can only ever set
-- their own display_name / avatar_url — never role or is_owner. Re-runnable.

alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists avatar_url   text;

notify pgrst, 'reload schema';
