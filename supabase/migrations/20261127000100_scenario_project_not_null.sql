-- Apply only after scripts/migrate_scenarios_to_projects.py --apply.
-- Fails while any scenario.project_id is null, which is the guard.

alter table public.scenario alter column project_id set not null;
