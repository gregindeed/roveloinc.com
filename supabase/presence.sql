-- ── Presence (who's online, and where) ───────────────────────────────────────
-- A once-a-minute heartbeat stamps last_seen_at on the user's own profile; a
-- user is "online" if seen within the last ~2.5 minutes. last_seen_client_id is
-- the entity they're currently viewing (drives entity presence avatars). Writes
-- go through a server action (service role, column-whitelisted). Re-runnable.

alter table public.profiles add column if not exists last_seen_at        timestamptz;
alter table public.profiles add column if not exists last_seen_client_id uuid references public.clients(id) on delete set null;

notify pgrst, 'reload schema';
