import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { MultiLineString } from 'geojson';
import { toast } from 'sonner';
import { AuthGuard } from '@/components/auth-guard';
import { AppNav } from '@/components/layout/app-nav';
import { MapPanel } from '@/components/map/MapPanel';
import type { PerspectiveKey } from '@/components/results/perspective-toggle';
import { PerspectiveToggle } from '@/components/results/perspective-toggle';
import { ResultsDispatcher } from '@/components/results/results-dispatcher';
import { ScenarioWizard } from '@/components/scenarios/scenario-wizard';
import { SectionDispatcher } from '@/components/sections/section-dispatcher';
import { terrainsForConstruction, terrainMilesPath } from '@/components/sections/terrain-mix';
import { ContentHeader } from '@/components/sidebar/content-header';
import { Sidebar } from '@/components/sidebar/sidebar';
import type { SubItemValidation } from '@/components/sidebar/sidebar-item';
import { ContributionStrip } from '@/components/workspace/contribution-strip';
import { WorkspaceHeader } from '@/components/workspace/workspace-header';
import { SIDEBAR_SECTIONS } from '@/data/sidebar-sections';
import { useNavigation } from '@/hooks/use-navigation';
import {
  calculateRequestBody,
  resolvedRowWidthFt,
  terrainMatchesRouteLength,
} from '@/lib/analyze-request';
import { ApiError, calculate } from '@/lib/api';
import { diffChanges } from '@/lib/changes';
import { debounce } from '@/lib/debounce';
import { getValueAtPath } from '@/lib/path';
import { isMultiLineString, scenarioMapRoute } from '@/lib/route-geometry';
import { useFormStore } from '@/stores/form-store';
import { exportAsCsv, exportAsForge, useScenarioStore } from '@/stores/scenario-store';
import type { Scenario, ScenarioGeometry } from '@/stores/scenario-store';

interface WizardDraft {
  name: string;
  source: string;
  fullInputs: Record<string, unknown>;
}

const PROJECT = '01_project_technical_details.project';
const ROW_ROOT = '11_project_row_details.right_of_way';
const MILES_TOLERANCE = 0.5;
const ZONE_COUNT = 15;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

function positiveNumber(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0;
  }
  return false;
}

function readNumber(data: Record<string, unknown>, path: string): number {
  const value = getValueAtPath(data, path);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && isRecord(error.body)) {
    const nested = error.body.error;
    if (isRecord(nested) && typeof nested.message === 'string' && nested.message) {
      return nested.message;
    }
    if (Array.isArray(error.body.paths)) {
      const paths = error.body.paths.filter((path) => typeof path === 'string');
      if (paths.length > 0) return `Invalid inputs: ${paths.join(', ')}`;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong';
}

function terrainMilesTotal(data: Record<string, unknown>): number {
  const construction = getValueAtPath(data, `${PROJECT}.construction_type`);
  return terrainsForConstruction(construction).reduce(
    (sum, terrain) => sum + readNumber(data, terrainMilesPath(terrain)),
    0,
  );
}

function rowMilesTotal(data: Record<string, unknown>): number {
  let total = 0;
  for (let zone = 1; zone <= ZONE_COUNT; zone += 1) {
    total += readNumber(data, `${ROW_ROOT}.zone_${zone}.miles`);
  }
  return total;
}

function hasRequiredFields(data: Record<string, unknown> | null): boolean {
  if (!data) return false;
  const construction = getValueAtPath(data, `${PROJECT}.construction_type`);
  const acDc = getValueAtPath(data, `${PROJECT}.ac_dc`);
  const capacity = getValueAtPath(data, `${PROJECT}.capacity_mw`);
  const conductor = getValueAtPath(data, `${PROJECT}.conductor_type`);
  if (isBlank(construction) || isBlank(acDc) || isBlank(conductor)) return false;
  if (!positiveNumber(capacity)) return false;
  if (acDc === 'DC' && isBlank(getValueAtPath(data, `${PROJECT}.converter_type`))) return false;
  if (getValueAtPath(data, `${PROJECT}.project_type`) === 'reconductoring') {
    const oldAcDc = getValueAtPath(data, `${PROJECT}.old_ac_dc`);
    if (isBlank(oldAcDc)) return false;
    if (!positiveNumber(getValueAtPath(data, `${PROJECT}.old_capacity_mw`))) return false;
    if (isBlank(getValueAtPath(data, `${PROJECT}.old_conductor_type`))) return false;
    if (oldAcDc === 'DC' && isBlank(getValueAtPath(data, `${PROJECT}.old_converter_type`))) {
      return false;
    }
  }
  return terrainMilesTotal(data) > 0;
}

function validationBadges(
  data: Record<string, unknown> | null,
  milesFromRoute: boolean,
): Record<string, SubItemValidation> {
  if (!data) return {};
  const badges: Record<string, SubItemValidation> = {};
  let technologyMissing = 0;
  if (isBlank(getValueAtPath(data, `${PROJECT}.construction_type`))) technologyMissing += 1;
  if (isBlank(getValueAtPath(data, `${PROJECT}.ac_dc`))) technologyMissing += 1;
  if (!positiveNumber(getValueAtPath(data, `${PROJECT}.capacity_mw`))) technologyMissing += 1;
  if (isBlank(getValueAtPath(data, `${PROJECT}.conductor_type`))) technologyMissing += 1;
  const acDc = getValueAtPath(data, `${PROJECT}.ac_dc`);
  if (acDc === 'DC' && isBlank(getValueAtPath(data, `${PROJECT}.converter_type`))) {
    technologyMissing += 1;
  }
  if (getValueAtPath(data, `${PROJECT}.project_type`) === 'reconductoring') {
    const oldAcDc = getValueAtPath(data, `${PROJECT}.old_ac_dc`);
    if (isBlank(oldAcDc)) technologyMissing += 1;
    if (!positiveNumber(getValueAtPath(data, `${PROJECT}.old_capacity_mw`))) technologyMissing += 1;
    if (isBlank(getValueAtPath(data, `${PROJECT}.old_conductor_type`))) technologyMissing += 1;
    if (oldAcDc === 'DC' && isBlank(getValueAtPath(data, `${PROJECT}.old_converter_type`))) {
      technologyMissing += 1;
    }
  }
  if (technologyMissing > 0) badges.technology = { invalidCount: technologyMissing };

  const terrainTotal = terrainMilesTotal(data);
  const rowTotal = rowMilesTotal(data);
  const milesDiffer = milesFromRoute
    ? !terrainMatchesRouteLength(terrainTotal, rowTotal)
    : Math.abs(terrainTotal - rowTotal) >= MILES_TOLERANCE;
  const mismatch = (terrainTotal > 0 || rowTotal > 0) && milesDiffer;
  if (terrainTotal <= 0 || mismatch) {
    badges['terrain-mix'] = {
      invalidCount: terrainTotal <= 0 ? 1 : 0,
      hasMismatch: mismatch,
    };
  }
  if (mismatch) badges['rights-of-way'] = { hasMismatch: true };
  return badges;
}

function calculationRoute(
  drawn: ScenarioGeometry | undefined,
  scenario: Scenario | null,
): MultiLineString | null {
  if (drawn !== undefined) {
    return isMultiLineString(drawn.route) ? drawn.route : null;
  }
  return scenarioMapRoute(scenario);
}

function plainRoute(route: MultiLineString): Record<string, unknown> {
  return { type: route.type, coordinates: route.coordinates };
}

function currentRowWidthFt(): number | null {
  const form = useFormStore.getState();
  if (!form.lookups) return null;
  return resolvedRowWidthFt(form.getProjectFields(), form.lookups);
}

function storeResults(scenarioId: string, results: Record<string, unknown>): void {
  useScenarioStore.setState((state) => ({
    scenarios: state.scenarios.map((scenario) =>
      scenario.id === scenarioId
        ? { ...scenario, results, calc_error: null }
        : scenario,
    ),
  }));
}

export default function WorkspacePage(): ReactElement {
  return (
    <AuthGuard>
      <WorkspaceBody />
    </AuthGuard>
  );
}

const SIDEBAR_STORAGE_KEY = 'forge-sidebar-collapsed';

function WorkspaceBody(): ReactElement {
  const { view, subItemId, setView, selectSubItem, openInputsSubItem } = useNavigation();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return sessionStorage.getItem(SIDEBAR_STORAGE_KEY) === '1'; }
    catch { return false; }
  });

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { sessionStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0'); }
      catch { /* ignore */ }
      return next;
    });
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key !== '[') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' || target.isContentEditable)) return;
      e.preventDefault();
      toggleSidebar();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [toggleSidebar]);

  const data = useFormStore((state) => state.data);
  const defaults = useFormStore((state) => state.defaults);
  const defaultsId = useFormStore((state) => state.defaultsId);
  const calculatorInfo = useFormStore((state) => state.calculatorInfo);
  const taxonomyState = useFormStore((state) => state.taxonomy);
  const loadScenarioChanges = useFormStore((state) => state.loadScenarioChanges);

  const scenarios = useScenarioStore((state) => state.scenarios);
  const activeScenarioId = useScenarioStore((state) => state.activeScenarioId);
  const unsavedChanges = useScenarioStore((state) => state.unsavedChanges);
  const setActiveScenario = useScenarioStore((state) => state.setActiveScenario);
  const createScenario = useScenarioStore((state) => state.createScenario);
  const saveScenario = useScenarioStore((state) => state.saveScenario);
  const renameScenario = useScenarioStore((state) => state.renameScenario);
  const setUnsavedChanges = useScenarioStore((state) => state.setUnsavedChanges);
  const savedResults = useScenarioStore((state) => state.savedResults);

  const [ready, setReady] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [draft, setDraft] = useState<WizardDraft | null>(null);
  const [calculationStatus, setCalculationStatus] = useState('Not calculated');
  const [perspective, setPerspective] = useState<PerspectiveKey>('societal');
  const [drawn, setDrawn] = useState<ScenarioGeometry | undefined>(undefined);

  const baselineRef = useRef<string | null>(null);
  const lastStatusRef = useRef('Not calculated');
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  const savingRef = useRef(false);
  const scheduleRef = useRef<() => void>(() => {});

  const activeScenario = scenarios.find((scenario) => scenario.id === activeScenarioId) ?? null;
  const savedRoutePresent =
    draft !== null ||
    activeScenario?.route != null ||
    (Array.isArray(activeScenario?.segments) && activeScenario.segments.length > 0);
  const milesFromRoute = drawn !== undefined ? drawn.route != null : savedRoutePresent;
  const validation = useMemo(
    () => validationBadges(data, milesFromRoute),
    [data, milesFromRoute],
  );

  const rememberBaseline = useCallback((): void => {
    try {
      baselineRef.current = JSON.stringify(useFormStore.getState().getChanges());
    } catch {
      baselineRef.current = null;
    }
    setUnsavedChanges(false);
  }, [setUnsavedChanges]);

  const applyScenario = useCallback(
    (scenario: Scenario): void => {
      setActiveScenario(scenario.id);
      loadScenarioChanges(scenario.changes);
      rememberBaseline();
      const status = scenario.results ? 'Calculated in 0.0s' : 'Not calculated';
      lastStatusRef.current = status;
      setCalculationStatus(status);
    },
    [loadScenarioChanges, rememberBaseline, setActiveScenario],
  );

  const runCalculation = useCallback(async (): Promise<void> => {
    const form = useFormStore.getState();
    const active = useScenarioStore.getState().getActiveScenario();
    if (!active || !form.defaultsId || !form.data || !hasRequiredFields(form.data)) return;
    const route = calculationRoute(drawn, active);
    const rowWidthFt = currentRowWidthFt();
    if (route == null || rowWidthFt == null) return;
    if (inFlightRef.current) {
      queuedRef.current = true;
      return;
    }

    inFlightRef.current = true;
    const scenarioId = active.id;
    const started = performance.now();
    setCalculationStatus('Calculating...');
    try {
      const changes = form.getChanges();
      const response = await calculate(
        calculateRequestBody(form.defaultsId, changes, route, rowWidthFt, scenarioId),
      );
      if (useScenarioStore.getState().activeScenarioId !== scenarioId) return;
      const status = `Calculated in ${((performance.now() - started) / 1000).toFixed(1)}s`;
      lastStatusRef.current = status;
      setCalculationStatus(status);
      storeResults(scenarioId, response.results);
    } catch (error) {
      toast.error(errorMessage(error));
      setCalculationStatus(lastStatusRef.current);
    } finally {
      inFlightRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        scheduleRef.current();
      }
    }
  }, [drawn]);

  const scheduleCalculation = useMemo(
    () => debounce(() => { void runCalculation(); }, 300),
    [runCalculation],
  );
  scheduleRef.current = scheduleCalculation;

  useEffect(() => {
    document.title = 'FORGE — Workspace';
  }, []);

  const applyScenarioRef = useRef(applyScenario);
  applyScenarioRef.current = applyScenario;

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);

    async function boot(): Promise<void> {
      try {
        await useFormStore.getState().loadAll();
        await useScenarioStore.getState().loadScenarios();
        if (cancelled) return;

        // `?tutorial=sunzia` is ignored until the tutorial player exists.
        if (params.get('new') === '1') setWizardOpen(true);

        const requestedId = params.get('scenario');
        if (requestedId) {
          const match = useScenarioStore
            .getState()
            .scenarios.find((scenario) => scenario.id === requestedId);
          if (match) applyScenarioRef.current(match);
          else toast.error('Scenario not found.');
        } else {
          const active = useScenarioStore.getState().getActiveScenario();
          if (active) applyScenarioRef.current(active);
        }
      } catch (error) {
        if (!cancelled) toast.error(errorMessage(error));
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !data) return;
    scheduleCalculation();
  }, [data, ready, scheduleCalculation]);

  useEffect(() => {
    if (!ready || !data || !activeScenarioId) return;
    let current: string;
    try {
      current = JSON.stringify(useFormStore.getState().getChanges());
    } catch {
      setUnsavedChanges(true);
      return;
    }
    if (baselineRef.current === null) {
      baselineRef.current = current;
      setUnsavedChanges(drawn !== undefined);
      return;
    }
    setUnsavedChanges(drawn !== undefined || current !== baselineRef.current);
  }, [activeScenarioId, data, drawn, ready, setUnsavedChanges]);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent): void {
      if (!useScenarioStore.getState().unsavedChanges) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  async function handleSave(): Promise<void> {
    const active = useScenarioStore.getState().getActiveScenario();
    if (!active || savingRef.current) return;
    if (!useScenarioStore.getState().unsavedChanges && drawn === undefined) return;
    const rowWidthFt = currentRowWidthFt();
    if (calculationRoute(drawn, active) == null || rowWidthFt == null) return;
    savingRef.current = true;
    try {
      const changes = useFormStore.getState().getChanges();
      await saveScenario(active.id, changes, active.revision, drawn, rowWidthFt);
      setDrawn(undefined);
      baselineRef.current = JSON.stringify(changes);
      const latest = JSON.stringify(useFormStore.getState().getChanges());
      setUnsavedChanges(latest !== baselineRef.current);
      toast.success('Saved');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      savingRef.current = false;
    }
  }

  async function handleRename(name: string): Promise<void> {
    const active = useScenarioStore.getState().getActiveScenario();
    if (!active || name === active.name) return;
    try {
      await renameScenario(active.id, name, active.revision);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  function liveScenario(): Scenario | null {
    const scenario = useScenarioStore.getState().getActiveScenario();
    if (!scenario) return null;
    try {
      return { ...scenario, changes: useFormStore.getState().getChanges() };
    } catch {
      return scenario;
    }
  }

  function handleExportForge(): void {
    const scenario = liveScenario();
    if (!scenario || !defaults || !defaultsId) {
      toast.error('Nothing to export yet.');
      return;
    }
    exportAsForge(scenario, defaults, defaultsId, calculatorInfo);
  }

  function handleExportCsv(): void {
    const scenario = liveScenario();
    if (!scenario || !defaults) {
      toast.error('Nothing to export yet.');
      return;
    }
    exportAsCsv(scenario, defaults);
  }

  const handleRouteChange = useCallback(
    (route: MultiLineString | null, segments: unknown[] | null): void => {
      setDrawn({
        route: route ? { type: route.type, coordinates: route.coordinates } : null,
        segments,
      });
      if (useScenarioStore.getState().activeScenarioId) {
        setUnsavedChanges(true);
      }
    },
    [setUnsavedChanges],
  );

  function beginDraft(
    name: string,
    source: string,
    fullInputs: Record<string, unknown>,
  ): void {
    const snapshot = useFormStore.getState().defaults;
    if (!snapshot) {
      toast.error('Reference data is not loaded yet.');
      return;
    }
    setDrawn(undefined);
    useScenarioStore.setState({
      activeScenarioId: null,
      unsavedChanges: false,
      savedResults: null,
    });
    loadScenarioChanges(diffChanges(snapshot, fullInputs));
    setDraft({ name, source, fullInputs });
    lastStatusRef.current = 'Not calculated';
    setCalculationStatus('Not calculated');
    openInputsSubItem('routing', 'route');
  }

  function handleWizardComplete(
    name: string,
    fullInputs: Record<string, unknown>,
    metadata: { timestamp: string; source: string },
  ): void {
    beginDraft(name, metadata.source || 'wizard', fullInputs);
  }

  async function handleCreate(): Promise<void> {
    if (!draft || savingRef.current) return;
    const form = useFormStore.getState();
    if (!form.data || terrainMilesTotal(form.data) <= 0) return;
    const route = calculationRoute(drawn, null);
    const rowWidthFt = currentRowWidthFt();
    if (route == null || rowWidthFt == null) return;
    savingRef.current = true;
    try {
      const scenario = await createScenario(
        draft.name,
        draft.source,
        form.getChanges(),
        plainRoute(route),
        drawn?.segments ?? null,
        rowWidthFt,
      );
      setDraft(null);
      setDrawn(undefined);
      applyScenario(scenario);
      toast.success('Scenario created');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      savingRef.current = false;
    }
  }

  function handleResultsNavigate(nextSubItemId: string): void {
    for (const section of SIDEBAR_SECTIONS.results) {
      if (section.subItems.some((item) => item.id === nextSubItemId)) {
        selectSubItem(section.id, nextSubItemId);
        return;
      }
    }
  }

  function handleStripNavigate(resultsSubItemId: string): void {
    const section = SIDEBAR_SECTIONS.results.find((item) =>
      item.subItems.some((subItem) => subItem.id === resultsSubItemId),
    );
    if (section) {
      setView('results');
      selectSubItem(section.id, resultsSubItemId);
    }
  }

  const taxonomy = isRecord(taxonomyState) ? taxonomyState : undefined;
  const projectFields = useFormStore.getState().getProjectFields();
  const reconductoring = useFormStore.getState().isReconductoring();
  const showRouteMap = view === 'inputs' && subItemId === 'route';
  const createMode = draft !== null && activeScenarioId === null;
  const canCreate =
    createMode &&
    terrainMilesTotal(data ?? {}) > 0 &&
    calculationRoute(drawn, null) != null &&
    currentRowWidthFt() != null;

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <AppNav />
      {!ready ? (
        <p className="p-6 text-sm text-slate-500">Loading workspace…</p>
      ) : (
        <>
          <WorkspaceHeader
            scenarioName={draft?.name ?? activeScenario?.name ?? ''}
            unsavedChanges={unsavedChanges}
            calculationStatus={calculationStatus}
            results={createMode ? null : (activeScenario?.results ?? null)}
            onSave={() => { void handleSave(); }}
            onRename={(name) => { void handleRename(name); }}
            onExportForge={handleExportForge}
            onExportCsv={handleExportCsv}
            createMode={createMode}
            canCreate={canCreate}
            onCreate={() => { void handleCreate(); }}
          />
          <div className="flex min-h-0 flex-1">
            <Sidebar validation={validation} collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
            <main
              className={
                showRouteMap
                  ? 'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
                  : 'min-w-0 flex-1 overflow-y-auto p-6'
              }
            >
              {showRouteMap ? null : <ContentHeader />}
              {view === 'inputs' ? (
                showRouteMap ? (
                  <div className="relative flex-1 min-h-0 overflow-hidden">
                    <MapPanel
                      createMode={draft !== null}
                      existingRoute={
                        draft ? scenarioMapRoute(drawn ?? null) : scenarioMapRoute(activeScenario)
                      }
                      onRouteChange={handleRouteChange}
                    />
                  </div>
                ) : (
                  <>
                    <ContributionStrip
                      results={activeScenario?.results ?? null}
                      savedResults={savedResults}
                      onNavigateResults={handleStripNavigate}
                    />
                    {subItemId ? (
                      <SectionDispatcher subItemId={subItemId} milesFromRoute={milesFromRoute} />
                    ) : null}
                  </>
                )
              ) : null}
              {view === 'results' ? (
                <>
                  <PerspectiveToggle
                    perspective={perspective}
                    onPerspectiveChange={setPerspective}
                  />
                  {subItemId ? (
                    <ResultsDispatcher
                      subItemId={subItemId}
                      results={activeScenario?.results ?? null}
                      perspective={perspective}
                      taxonomy={taxonomy}
                      isReconductoring={reconductoring}
                      acDc={projectFields.acDc}
                      constructionType={projectFields.constructionType}
                      onNavigate={handleResultsNavigate}
                    />
                  ) : null}
                </>
              ) : null}
              {view === 'sensitivity' ? (
                <p className="text-sm text-slate-500">Sensitivity analysis is not available yet.</p>
              ) : null}
            </main>
          </div>
        </>
      )}
      <ScenarioWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        defaultsSnapshot={defaults}
        onComplete={handleWizardComplete}
      />
    </div>
  );
}
