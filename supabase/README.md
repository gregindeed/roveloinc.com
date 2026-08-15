# Database migrations

## Where we're headed
We're moving from **hand-run SQL files applied in the Supabase SQL editor** to the
**Supabase CLI** with versioned, diffable migrations in `supabase/migrations/`.
This gives a single source of truth (generated from the live schema), a reliable
way to rebuild a fresh database, and schema history in git.

## One-time consolidation (do this once)
Run these on the machine that has the repo:

```bash
# 1. Install the CLI
brew install supabase/tap/supabase       # or: npm i -g supabase

# 2. Initialize (creates supabase/config.toml + a migrations/ dir; keeps our files)
supabase init

# 3. Link to the live project
supabase login
supabase link --project-ref <PROJECT_REF>   # ref is in the Supabase URL / Settings → General

# 4. Snapshot the CURRENT live schema into one migration.
#    This captures everything already applied (all the files below, in their
#    final state) — which also fixes the stale-schema.sql drift.
supabase db pull                             # prompts for the DB password (Settings → Database)

# 5. Archive the legacy hand-run files (superseded by the snapshot above)
mkdir -p supabase/archive
git mv supabase/*.sql supabase/archive/      # moves the top-level *.sql, not migrations/
git add -A && git commit -m "Consolidate DB schema into Supabase CLI migrations"
```

## Going forward
Never hand-run SQL in the editor again. Instead:

```bash
supabase migration new add_something   # creates supabase/migrations/<ts>_add_something.sql
# edit that file, then:
supabase db push                       # applies pending migrations to the linked project
```

## Legacy apply order (for reference / archive)
These were applied by hand, in this order, before the CLI consolidation:

1. `schema.sql` — base tables + `is_admin()` / `current_client_id()` helpers
2. `documents.sql` — documents + storage policies
3. `compliance.sql` — obligations / obligation_events
4. `entity_profile.sql` — extended entity columns
5. `ai.sql` — ai_assessments
6. `folders.sql` — document_years + folder filing
7. `access.sql` — team-access tiers, `is_owner()`, `can_read_entity()` / `can_write_entity()`, per-table `_read`/`_write` policies
8. `overseer-context.sql` — `clients.overseer_context`
9. `ledger.sql` — `chart_of_accounts` + transaction `account_id`
10. `statements.sql` — `statement_imports`
11. `audit-p0.sql` — tightened `clients` policies + transaction `import_id`

> Note: `schema.sql` is stale relative to later files (its role enum predates
> `collaborator`, and its policies are overwritten by `access.sql`). The
> `supabase db pull` snapshot is authoritative once created — treat these files
> as history only.
