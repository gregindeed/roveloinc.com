-- ── Per-user language ────────────────────────────────────────────────────────
-- Language is a personal preference (a firm can have mixed-language staff), so it
-- lives on the user's profile. A cookie mirrors it for instant switching; this is
-- the durable store that follows them across devices. Re-runnable.

alter table public.profiles add column if not exists locale text not null default 'en';

notify pgrst, 'reload schema';
