# Task 3 report: Comparison table config fixes

**Status: DONE**

## Commit

- `7c619e452b357bc7bc9066874f8d13c0732f20c9` — `fix: comparison table stale revenue path, dead labels, missing exclusion BCRs`

## What changed

`frontend/src/data/configs.ts` only.

- Revenue metric: `path` is now `bcr.capital_recovery_pv`. `key: 'revenue_pv'` and `label: 'Revenue'` are unchanged.
- Removed `'BCR — System'` and `'BCR — Capital Screening'` from `COMPARISON_GROUP_SUPERGROUP`. No `COMPARISON_METRICS` group used those names.
- Appended three metrics to `'BCR — Societal Exclusions'`:
  - `bcr_excl_emissions` → `bcr.bcr_excluding_emissions` (`BCR excl. Emissions Costs`)
  - `bcr_excl_outage` → `bcr.bcr_excluding_outage_risk` (`BCR excl. Outage`)
  - `bcr_excl_all_emissions` → `bcr.bcr_excluding_avoided_emissions_and_emissions` (`BCR excl. All Emissions`)

The existing `'BCR — Societal Exclusions': 'sensitivity'` supergroup entry already covers the new metrics.

## Tests

`npx tsc --noEmit && npm run build` exited 0. Vite printed the existing chunk-size warning; the build still succeeded.

## Concerns

`frontend/src/stores/scenario-store.ts` still maps export key `revenue_pv` to `bcr.revenue_pv` in `RESULTS_EXPORT_FIELDS` (line 126). The brief limited this task to `configs.ts`, so that export path is still stale. The comparison column and a results export of the same key can disagree.

`results-utils.ts` reads `rev.revenue_pv` off a revenue breakdown object. That is a different field from the BCR path fixed here.
