-- Every project names its NERC regions. scripts/backfill_project_regions.py
-- --apply fills existing rows first; this migration fails on any row that
-- is still null, so it cannot run ahead of the backfill.

alter table public.project
  alter column nerc_regions set not null;
