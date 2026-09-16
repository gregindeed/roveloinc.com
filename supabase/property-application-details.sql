-- Comprehensive rental application extras.
-- Adds a single JSONB `details` column to rental_applications that holds the
-- structured sections beyond the core typed columns (residence history,
-- employment detail, household, emergency contact, background screening,
-- e-signature). Keeping it as one JSONB column lets the public application
-- form grow without further schema churn. RLS is unchanged — the existing
-- rental_applications policies already scope reads/writes by client.
--
-- Idempotent: safe to re-run. Run AFTER property-applications.sql.

alter table public.rental_applications
  add column if not exists details jsonb;

notify pgrst, 'reload schema';
