-- ── Firm partnership notes ───────────────────────────────────────────────────
-- A short description of the partnership captured when a partner firm is
-- onboarded — what the engagement covers, who they are — so a firm reads as a
-- real relationship, not just a name. Run AFTER firms.sql. Re-runnable.

alter table public.organizations add column if not exists notes text;

notify pgrst, 'reload schema';
