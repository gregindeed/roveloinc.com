-- ── Overseer read: language + cached translations ────────────────────────────
-- The Overseer's assessment is stored prose. To make the language toggle
-- translate it, remember which language it was written in and cache per-locale
-- translations so a second view is instant. Re-runnable.

alter table public.ai_assessments add column if not exists source_lang text;
alter table public.ai_assessments add column if not exists translations jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
