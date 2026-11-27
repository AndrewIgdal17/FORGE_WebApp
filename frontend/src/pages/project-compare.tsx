import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { Navigate, useParams } from 'react-router';
import { AuthGuard } from '@/components/auth-guard';
import { ComparisonTable } from '@/components/comparison/comparison-table';
import { formatComparisonValue } from '@/components/comparison/delta-display';
import { AppNav } from '@/components/layout/app-nav';
import { Button } from '@/components/ui/button';
import {
  COMPARISON_GROUP_SUPERGROUP,
  COMPARISON_METRICS,
  type ComparisonMetric,
} from '@/data/configs';
import { useAuth } from '@/hooks/use-auth';
import { toast } from '@/hooks/use-toast';
import { changedInputs, routeRow, type ChangedInputRow } from '@/lib/changed-inputs';
import { csvEscape } from '@/lib/csv';
import { formatCurrency, formatNumber } from '@/lib/format';
import { getValueAtPath } from '@/lib/path';
import {
  DOES_NOT_APPLY,
  itemDoesNotApply,
  readCategoryTotal,
  stateDoesNotApply,
} from '@/lib/results-utils';
import { isProjectReadOnly, useProjectStore, type Project } from '@/stores/project-store';
import { useScenarioStore, type Scenario } from '@/stores/scenario-store';
import { useFormStore } from '@/stores/form-store';

export interface ProjectCompareViewProps {
  scenarios: Scenario[];
  baseId: string;
  defaults: Record<string, unknown>;
  labelFor: (path: string) => string;
  onBaseChange: (scenarioId: string) => void;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function orderScenarios(scenarios: Scenario[], baseId: string): Scenario[] {
  const base = scenarios.find((scenario) => scenario.id === baseId) ?? null;
  const rest = scenarios
    .filter((scenario) => scenario.id !== baseId)
    .sort(
      (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    );
  return base ? [base, ...rest] : rest;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function computeCustomMetric(results: Record<string, unknown>, key: string): number | null {
  const bcr = results.bcr;
  const record = isRecord(bcr) ? bcr : {};
  const benefits = finiteNumber(record.total_benefits_pv);
  const costs = finiteNumber(record.total_costs_pv);
  if (benefits === null || costs === null) return null;
  if (key === 'custom_bcr') return costs > 0 ? benefits / costs : 0;
  return benefits - costs;
}

function readMetricValue(scenario: Scenario, metric: ComparisonMetric): unknown {
  if (!scenario.results) return undefined;
  if (metric.key === 'custom_bcr' || metric.key === 'custom_nb') {
    return computeCustomMetric(scenario.results, metric.key);
  }
  if (metric.reportingKey) {
    return readCategoryTotal(scenario.results, metric.reportingKey);
  }
  return getValueAtPath(scenario.results, metric.path);
}

function isAvoidedCost(metric: ComparisonMetric): boolean {
  for (const group of COMPARISON_METRICS) {
    if (!group.metrics.some((item) => item.key === metric.key)) continue;
    return COMPARISON_GROUP_SUPERGROUP[group.group] === 'costs';
  }
  return false;
}

function decimalsFor(format: ComparisonMetric['format']): number {
  if (format === 'number3') return 3;
  if (format === 'number2') return 2;
  return 0;
}

function formatSigned(value: number, format: ComparisonMetric['format']): string {
  const abs =
    format === 'currency'
      ? formatCurrency(Math.abs(value), 0)
      : formatNumber(Math.abs(value), decimalsFor(format));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;
  return abs;
}

/** A null or missing result stays "Not available" and carries no difference. */
function resultCell(
  scenario: Scenario,
  metric: ComparisonMetric,
  baseline: Scenario | undefined,
): string {
  if (
    (metric.appliesId && itemDoesNotApply(scenario.results, metric.appliesId)) ||
    (metric.statePath && stateDoesNotApply(scenario.results, metric.statePath))
  ) {
    return DOES_NOT_APPLY;
  }
  const raw = readMetricValue(scenario, metric);
  const shown = formatComparisonValue(raw, metric.format);
  const isBaseline = baseline !== undefined && scenario.id === baseline.id;
  if (isBaseline || metric.format === 'text') return shown;
  const value = finiteNumber(raw);
  const baselineValue = baseline ? finiteNumber(readMetricValue(baseline, metric)) : null;
  if (value === null || baselineValue === null) return shown;
  const delta = isAvoidedCost(metric) ? baselineValue - value : value - baselineValue;
  return `${shown} (Δ ${formatSigned(delta, metric.format)})`;
}

export function displayChanged(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? value.toLocaleString('en-US', { maximumFractionDigits: 6 })
      : 'Not available';
  }
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (value === null || value === undefined) return '—';
  return JSON.stringify(value);
}

export function compareCsv(
  scenarios: Scenario[],
  baseId: string,
  defaults: Record<string, unknown>,
  labelFor: (path: string) => string,
  showAll: boolean,
): string {
  const ordered = orderScenarios(scenarios, baseId);
  const baseline = ordered.find((scenario) => scenario.id === baseId);
  const inputRows: ChangedInputRow[] = [
    ...changedInputs(ordered, baseId, labelFor, showAll, defaults),
    routeRow(ordered, baseId),
  ];
  const lines: string[] = [
    ['label', ...ordered.map((scenario) => scenario.name)].map(csvEscape).join(','),
  ];
  for (const row of inputRows) {
    lines.push(
      [row.label, ...ordered.map((scenario) => displayChanged(row.values[scenario.id]))]
        .map(csvEscape)
        .join(','),
    );
  }
  for (const group of COMPARISON_METRICS) {
    for (const metric of group.metrics) {
      lines.push(
        [
          metric.label,
          ...ordered.map((scenario) => resultCell(scenario, metric, baseline)),
        ]
          .map(csvEscape)
          .join(','),
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

function downloadCsvText(contents: string, filename: string): void {
  const blob = new Blob([contents], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function labelFromMetadata(metadata: unknown[] | null): (path: string) => string {
  return (path: string) => {
    if (!metadata) return path;
    for (const item of metadata) {
      if (!isRecord(item)) continue;
      if (typeof item.label !== 'string') continue;
      if (typeof item.yaml_section !== 'string' || typeof item.field_path !== 'string') continue;
      if (`${item.yaml_section}.${item.field_path}` === path) return item.label;
    }
    return path;
  };
}

export function fallbackBaseId(project: Project, scenarios: Scenario[]): string {
  if (
    project.base_scenario_id &&
    scenarios.some((scenario) => scenario.id === project.base_scenario_id)
  ) {
    return project.base_scenario_id;
  }
  const oldest = [...scenarios].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  )[0];
  return oldest?.id ?? '';
}

export function ProjectCompareView({
  scenarios,
  baseId,
  defaults,
  labelFor,
  onBaseChange,
}: ProjectCompareViewProps): ReactElement {
  const [showAll, setShowAll] = useState(false);
  const ordered = useMemo(() => orderScenarios(scenarios, baseId), [scenarios, baseId]);
  const rows = useMemo(() => {
    return [
      ...changedInputs(ordered, baseId, labelFor, showAll, defaults),
      routeRow(ordered, baseId),
    ];
  }, [ordered, baseId, labelFor, showAll, defaults]);

  function onDownload(): void {
    downloadCsvText(
      compareCsv(ordered, baseId, defaults, labelFor, showAll),
      'forge-compare.csv',
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
          Base:
          <select
            aria-label="Base"
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
            value={baseId}
            onChange={(event) => onBaseChange(event.target.value)}
          >
            {ordered.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" variant="outline" onClick={onDownload}>
          Download CSV
        </Button>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Changed inputs</h2>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(event) => setShowAll(event.target.checked)}
            />
            Show all inputs
          </label>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-max min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="px-3 py-2 text-left font-medium text-slate-600" />
                {ordered.map((scenario) => (
                  <th
                    key={scenario.id}
                    className="px-3 py-2 text-left font-medium text-slate-900"
                  >
                    {scenario.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.path} className="border-b last:border-b-0">
                  <th className="px-3 py-2 text-left font-medium text-slate-700">
                    {row.label}
                  </th>
                  {ordered.map((scenario) => (
                    <td key={scenario.id} className="px-3 py-2 align-top text-slate-800">
                      {displayChanged(row.values[scenario.id])}
                      {row.differsFromBase[scenario.id] ? ' ●' : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-slate-900">Results</h2>
        <ComparisonTable
          scenarios={ordered}
          baselineId={baseId}
          showDelta
          showPercentDelta={false}
        />
      </section>
    </div>
  );
}

export default function ProjectComparePage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const currentUserId = session?.user.id ?? null;

  const projects = useProjectStore((state) => state.projects);
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const setBase = useProjectStore((state) => state.setBase);
  const scenarios = useScenarioStore((state) => state.scenarios);
  const loadScenarios = useScenarioStore((state) => state.loadScenarios);
  const defaults = useFormStore((state) => state.defaults);
  const inputMetadata = useFormStore((state) => state.inputMetadata);
  const loadAll = useFormStore((state) => state.loadAll);

  const [ready, setReady] = useState(false);
  const [sessionBaseId, setSessionBaseId] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'FORGE — Compare';
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadProjects(), loadScenarios(), loadAll()])
      .catch((error: unknown) => {
        if (!cancelled) toast.error(errorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loadProjects, loadScenarios, loadAll]);

  const project = id ? projects.find((item) => item.id === id) ?? null : null;
  const projectScenarios = scenarios.filter((scenario) => scenario.project_id === id);
  const readOnly =
    project === null ||
    currentUserId === null ||
    isProjectReadOnly(project, projectScenarios, currentUserId);
  const baseId =
    sessionBaseId !== null && projectScenarios.some((scenario) => scenario.id === sessionBaseId)
      ? sessionBaseId
      : project
        ? fallbackBaseId(project, projectScenarios)
        : '';
  const labelFor = useMemo(
    () => labelFromMetadata(inputMetadata),
    [inputMetadata],
  );

  function handleBase(scenarioId: string): void {
    setSessionBaseId(scenarioId);
    if (!project || readOnly) return;
    const current =
      useProjectStore.getState().projects.find((item) => item.id === project.id) ?? project;
    void setBase(current.id, scenarioId, current.revision).catch((error: unknown) => {
      setSessionBaseId(null);
      toast.error(errorMessage(error));
    });
  }

  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col bg-slate-50">
        <AppNav />
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
          {!ready ? (
            <p className="text-sm text-slate-600">Loading compare…</p>
          ) : !id || !project ? (
            <Navigate to="/app/projects" replace />
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-slate-900">{project.name}</h1>
              {projectScenarios.length === 0 ? (
                <p className="text-sm text-slate-600">This project has no scenario.</p>
              ) : (
                <ProjectCompareView
                  scenarios={projectScenarios}
                  baseId={baseId}
                  defaults={defaults ?? {}}
                  labelFor={labelFor}
                  onBaseChange={handleBase}
                />
              )}
            </>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
