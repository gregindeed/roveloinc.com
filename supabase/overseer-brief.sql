-- A short, one-glance "business brief" alongside the fuller Overseer read, so the
-- entity Overview can show a calm summary and keep the detailed read in a
-- slide-over. Nullable + additive; existing rows keep their `content` read and
-- simply have no brief until regenerated. Safe to re-run.
alter table ai_assessments add column if not exists brief text;
