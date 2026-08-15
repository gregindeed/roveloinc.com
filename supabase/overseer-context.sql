-- Overseer context: a human-written briefing the bookkeeper feeds to the AI
-- "Overseer" so it understands how an entity actually operates. Injected into
-- every assessment (Overview / Compliance / Documents) as `operator_briefing`.
alter table clients add column if not exists overseer_context text;

-- Reload PostgREST's schema cache so the new column is queryable immediately.
notify pgrst, 'reload schema';
