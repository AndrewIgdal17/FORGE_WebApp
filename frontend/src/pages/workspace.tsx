import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { LegacyBanner } from '@/components/results/legacy-banner';
import { showLegacyBanner } from '@/lib/legacy';
import type { MultiLineString, MultiPolygon, Polygon } from 'geojson';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { AuthGuard } from '@/components/auth-guard';
import { AppNav } from '@/components/layout/app-nav';
import { MapPanel } from '@/components/map/MapPanel';
import type { TerminalMarkerSpec } from '@/components/map/terminal-markers';
import type { DrawTerminals } from '@/hooks/use-route-draw';
import type { PerspectiveKey } from '@/components/results/perspective-toggle';
import { PerspectiveToggle } from '@/components/results/perspective-toggle';
import { ResultsDispatcher } from '@/components/results/results-dispatcher';
import { ScenarioWizard } from '@/components/scenarios/scenario-wizard';
import { SectionDispatcher } from '@/components/sections/section-dispatcher';
import { terrainsForConstruction, terrainMilesPath } from '@/components/sections/terrain-mix';
import { ContentHeader } from '@/components/sidebar/content-header';
import { Sidebar } from '@/components/sidebar/sidebar';
import type { SubItemValidation } from '@/components/sidebar/sidebar-item';
import { newScenarioFromDefaults } from '@/components/projects/scenario-toolbar';
import { ContributionStrip } from '@/components/workspace/contribution-strip';
import { WorkspaceHeader } from '@/components/workspace/workspace-header';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SIDEBAR_SECTIONS } from '@/data/sidebar-sections';
import { useAuth } from '@/hooks/use-auth';
import { useNavigation } from '@/hooks/use-navigation';
import {
  calculateRequestBody,
  resolvedRowWidthFt,
  rowWidthProblem,
  terrainMatchesRouteLength,
} from '@/lib/analyze-request';
import { ApiError, calculate, getSubstationFootprint, requiredInputs } from '@/lib/api';
import type { LineSelectionIn, RequiredField, RequiredResponse } from '@/lib/api';
import { diffChanges } from '@/lib/changes';
import { debounce } from '@/lib/debounce';
import { duplicateAction } from '@/lib/duplicate-action';
import { useLineDataPrefill } from '@/lib/line-select';
import { canCalculate, canDraw, panelFields } from '@/lib/required-gates';
import { getValueAtPath } from '@/lib/path';
import { isMultiLineString, scenarioMapRoute } from '@/lib/route-geometry';
import type { TerminalFootprints } from '@/lib/terminals';
import { useFormStore } from '@/stores/form-store';
import {
  clearLastWorkspace,
  projectScenarioMap,
  readLastWorkspace,
  reconcileRemembered,
  workspaceEntry,
  writeLastWorkspace,
  type LastWorkspace,
} from '@/lib/last-workspace';
import { isProjectReadOnly, useProjectStore } from '@/stores/project-store';
import type { Project } from '@/stores/project-store';
import {
  exportAsCsv,
  exportAsForge,
  saveAction,
  scenarioForWorkspace,
  useScenarioStore,
  workspaceUrl,
} from '@/stores/scenario-store';
import type { DraftTerminal, Scenario, ScenarioDraft, ScenarioGeometry } from '@/stores/scenario-store';

interface WizardDraft {
  name: string;
  source: string;
  fullInputs: Record<string, unknown>;
  project_id?: string;
  terminals?: ScenarioDraft['terminals'];
}

const PROJECT = '01_project_technical_details.project';
const ROW_ROOT = '11_project_row_details.right_of_way';
const MILES_TOLERANCE = 0.5;
const ZONE_COUNT = 15;
const ROUTE_REQUIRED = 'A drawn route inside the lower 48 is required.';
const WIDTH_REQUIRED = 'row_width_ft must be a positive number';
const NO_TERMINAL_MARKERS: TerminalMarkerSpec[] = [];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isLonLatPair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

async function footprintOrNull(gid: number | null): Promise<Polygon | MultiPolygon | null> {
  if (gid === null) return null;
  try {
    return await getSubstationFootprint(gid);
  } catch {
    return null;
  }
}

function projectDrawTerminals(project: Project): DrawTerminals | null {
  if (!isLonLatPair(project.sending_point) || !isLonLatPair(project.receiving_point)) {
    return null;
  }
  return {
    sending: project.sending_point,
    receiving: project.receiving_point,
    sendingName: project.sending_name,
    receivingName: project.receiving_name,
  };
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

function replacesExistingLine(projectType: unknown): boolean {
  return projectType === 'reconductoring' || projectType === 'rebuild';
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
  if (replacesExistingLine(getValueAtPath(data, `${PROJECT}.project_type`))) {
    const oldAcDc = getValueAtPath(data, `${PROJECT}.old_ac_dc`);
    if (isBlank(oldAcDc)) return false;
    if (!positiveNumber(getValueAtPath(data, `${PROJECT}.old_capacity_mw`))) return false;
    if (isBlank(getValueAtPath(data, `${PROJECT}.old_conductor_type`))) return false;
    if (oldAcDc === 'DC' && isBlank(getValueAtPath(data, `${PROJECT}.old_converter_type`))) {
      return false;
    }
  }
  if (getValueAtPath(data, `${PROJECT}.row_agreement_type`) === 'fee_simple') return false;
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
  if (replacesExistingLine(getValueAtPath(data, `${PROJECT}.project_type`))) {
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
  const rowAgreementInvalid =
    getValueAtPath(data, `${PROJECT}.row_agreement_type`) === 'fee_simple';
  if (mismatch || rowAgreementInvalid) {
    badges['rights-of-way'] = {
      ...(mismatch ? { hasMismatch: true } : {}),
      ...(rowAgreementInvalid ? { invalidCount: 1 } : {}),
    };
  }
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

/** The specific reason the width is missing, naming the field to set. */
function currentWidthMessage(): string {
  const form = useFormStore.getState();
  if (!form.lookups) return WIDTH_REQUIRED;
  return rowWidthProblem(form.getProjectFields(), form.lookups) ?? WIDTH_REQUIRED;
}

let formLoad: Promise<void> | null = null;

/** Share one in-flight defaults load so a second boot cannot reset the form after a draft is applied. */
function loadFormDefaults(): Promise<void> {
  if (!formLoad) {
    formLoad = useFormStore.getState().loadAll().finally(() => {
      formLoad = null;
    });
  }
  return formLoad;
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

function isMetadataRow(value: unknown): value is {
  yaml_section: string;
  field_path: string;
  input_tab: string;
  sub_tab: string | null;
} {
  if (!isRecord(value)) return false;
  return (
    typeof value.yaml_section === 'string' &&
    typeof value.field_path === 'string' &&
    typeof value.input_tab === 'string' &&
    (typeof value.sub_tab === 'string' || value.sub_tab === null)
  );
}

/** Sidebar target for a calculator path, from input metadata when it is loaded. */
function sectionForRequiredPath(
  path: string,
  metadata: unknown[] | null,
): { sectionId: string; subItemId: string } | null {
  if (metadata) {
    for (const item of metadata) {
      if (!isMetadataRow(item)) continue;
      if (`${item.yaml_section}.${item.field_path}` !== path) continue;
      if (!item.sub_tab) return null;
      return { sectionId: item.input_tab, subItemId: item.sub_tab };
    }
  }
  if (path.includes('flow_factor') || path.includes('average_exceedance')) {
    return { sectionId: 'benefits', subItemId: 'system-constraints' };
  }
  return null;
}

function BeforeCalculationPanel({
  fields,
  onOpen,
}: {
  fields: RequiredField[];
  onOpen: (path: string) => void;
}): ReactElement | null {
  if (fields.length === 0) return null;
  return (
    <section
      aria-label="Before the first calculation"
      className="border-b border-amber-200 bg-amber-50 px-4 py-3"
    >
      <h2 className="text-sm font-semibold text-slate-900">Before the first calculation</h2>
      <ul className="mt-2 grid gap-1">
        {fields.map((field) => (
          <li key={field.path}>
            <button
              type="button"
              className="text-left text-sm text-sky-800 underline decoration-sky-800/40 underline-offset-2 hover:decoration-sky-800"
              onClick={() => onOpen(field.path)}
            >
              {field.message}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
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
  const inputMetadata = useFormStore((state) => state.inputMetadata);
  const loadScenarioChanges = useFormStore((state) => state.loadScenarioChanges);

  const scenarios = useScenarioStore((state) => state.scenarios);
  const activeScenarioId = useScenarioStore((state) => state.activeScenarioId);
  const unsavedChanges = useScenarioStore((state) => state.unsavedChanges);
  const setActiveScenario = useScenarioStore((state) => state.setActiveScenario);
  const createScenario = useScenarioStore((state) => state.createScenario);
  const createProjectWithScenario = useScenarioStore(
    (state) => state.createProjectWithScenario,
  );
  const saveScenario = useScenarioStore((state) => state.saveScenario);
  const { session } = useAuth();
  const currentUserId = session?.user?.id ?? null;
  const renameScenario = useScenarioStore((state) => state.renameScenario);
  const duplicateScenario = useScenarioStore((state) => state.duplicateScenario);
  const deleteScenario = useScenarioStore((state) => state.deleteScenario);
  const setUnsavedChanges = useScenarioStore((state) => state.setUnsavedChanges);
  const savedResults = useScenarioStore((state) => state.savedResults);

  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const projects = useProjectStore((state) => state.projects);
  const [locationProjectId, setLocationProjectId] = useState<string | null>(() => {
    const value = new URLSearchParams(window.location.search).get('project');
    return value ? value : null;
  });
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [ready, setReady] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [draft, setDraft] = useState<WizardDraft | null>(null);
  const [lineDataStale, setLineDataStale] = useState(false);
  const [terminalPick, setTerminalPick] = useState<'sending' | 'receiving' | null>(null);
  const [pendingSending, setPendingSending] = useState<DraftTerminal | null>(null);
  const [calculationStatus, setCalculationStatus] = useState('Not calculated');
  const [perspective, setPerspective] = useState<PerspectiveKey>('societal');
  const [drawn, setDrawn] = useState<ScenarioGeometry | undefined>(undefined);
  const [required, setRequired] = useState<RequiredResponse | null>(null);
  const [terminalFootprints, setTerminalFootprints] = useState<TerminalFootprints | null>(null);
  const [pendingLineSelection, setPendingLineSelection] = useState<LineSelectionIn | null | undefined>(
    undefined,
  );
  const projectTypeRef = useRef<unknown>(null);

  const baselineRef = useRef<string | null>(null);
  const lastStatusRef = useRef('Not calculated');
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  const savingRef = useRef(false);
  const scheduleRef = useRef<() => void>(() => {});
  const requiredSeq = useRef(0);
  const requiredRef = useRef<RequiredResponse | null>(null);
  const drawnRef = useRef(drawn);
  const runCalculationRef = useRef<() => Promise<void>>(async () => {});
  requiredRef.current = required;
  drawnRef.current = drawn;

  function updateDrawn(next: ScenarioGeometry | undefined): void {
    drawnRef.current = next;
    setDrawn(next);
  }

  function goToWorkspace(projectId: string, scenarioId: string): void {
    const next = workspaceUrl(projectId, scenarioId);
    if (`${window.location.pathname}${window.location.search}` !== next) {
      window.history.replaceState(null, '', next);
    }
    setLocationProjectId((current) => (current === projectId ? current : projectId));
  }

  const activeScenario = scenarios.find((scenario) => scenario.id === activeScenarioId) ?? null;
  const savedRoutePresent =
    draft !== null ||
    activeScenario?.route != null ||
    (Array.isArray(activeScenario?.segments) && activeScenario.segments.length > 0);
  const milesFromRoute = drawn !== undefined ? drawn.route != null : savedRoutePresent;
  const routeDrawn = calculationRoute(drawn, activeScenario) != null;
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
      useLineDataPrefill.getState().reset();
      setLineDataStale(false);
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
    const route = calculationRoute(drawn, active);
    const requiredNow = requiredRef.current;
    if (!requiredNow || !canCalculate(requiredNow, route != null)) return;
    if (!active || !form.defaultsId || !form.data || !hasRequiredFields(form.data)) return;
    const rowWidthFt = currentRowWidthFt();
    if (route == null) {
      setCalculationStatus(ROUTE_REQUIRED);
      return;
    }
    if (rowWidthFt == null) {
      setCalculationStatus(currentWidthMessage());
      return;
    }
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
  runCalculationRef.current = runCalculation;

  const scheduleCalculation = useMemo(
    () => debounce(() => { void runCalculation(); }, 300),
    [runCalculation],
  );
  scheduleRef.current = scheduleCalculation;

  const refreshRequired = useCallback(async (): Promise<void> => {
    const form = useFormStore.getState();
    if (!form.data || !form.defaults) return;
    const changes = form.getChanges();
    const snapshot = JSON.stringify(changes);
    const seq = requiredSeq.current + 1;
    requiredSeq.current = seq;
    try {
      const next = await requiredInputs(changes);
      if (seq !== requiredSeq.current) return;
      if (JSON.stringify(useFormStore.getState().getChanges()) !== snapshot) return;
      requiredRef.current = next;
      setRequired((current) => {
        if (current && JSON.stringify(current) === JSON.stringify(next)) return current;
        return next;
      });
      const active = useScenarioStore.getState().getActiveScenario();
      const route = calculationRoute(drawnRef.current, active);
      if (active && canCalculate(next, route != null)) {
        void runCalculationRef.current();
      }
    } catch (error) {
      if (seq !== requiredSeq.current) return;
      toast.error(errorMessage(error));
    }
  }, []);

  const scheduleRequired = useMemo(
    () => debounce(() => { void refreshRequired(); }, 300),
    [refreshRequired],
  );

  useEffect(() => {
    document.title = 'FORGE — Workspace';
  }, []);

  const applyScenarioRef = useRef(applyScenario);
  applyScenarioRef.current = applyScenario;

  const beginImportedDraft = useCallback((imported: ScenarioDraft): void => {
    const snapshot = useFormStore.getState().defaults;
    if (!snapshot) return;
    updateDrawn(undefined);
    useScenarioStore.setState({
      activeScenarioId: null,
      unsavedChanges: false,
      savedResults: null,
    });
    loadScenarioChanges(imported.changes);
    const fullInputs = useFormStore.getState().data ?? snapshot;
    setDraft({
      name: imported.name,
      source: imported.source,
      fullInputs,
      project_id: imported.project_id,
      terminals: imported.terminals,
    });
    lastStatusRef.current = 'Not calculated';
    setCalculationStatus('Not calculated');
    openInputsSubItem('routing', 'route');
    void refreshRequired();
  }, [loadScenarioChanges, openInputsSubItem, refreshRequired]);

  const beginImportedDraftRef = useRef(beginImportedDraft);
  useEffect(() => {
    beginImportedDraftRef.current = beginImportedDraft;
  }, [beginImportedDraft]);

  // Reads the remembered workspace and reconciles it with loaded data. Only call
  // after the project store has loaded: a stale value is cleared only then.
  function rememberedForEntry(): LastWorkspace | null {
    const reconciled = reconcileRemembered(
      readLastWorkspace(),
      useProjectStore.getState().projects,
      useScenarioStore.getState().scenarios,
    );
    if (!reconciled) clearLastWorkspace();
    return reconciled;
  }

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);

    async function boot(): Promise<void> {
      try {
        await loadFormDefaults();
        await Promise.all([
          useScenarioStore.getState().loadScenarios(),
          useProjectStore.getState().loadProjects(),
        ]);
        if (cancelled) return;

        if (useFormStore.getState().defaults) {
          const pending = useScenarioStore.getState().consumePendingDraft();
          if (pending) {
            beginImportedDraftRef.current(pending);
            return;
          }
        }

        // Entry rule. Only decide once the project store has loaded successfully.
        let requestedProject = params.get('project');
        let requestedId = params.get('scenario');
        if (useProjectStore.getState().loaded) {
          const { projects } = useProjectStore.getState();
          const { scenarios } = useScenarioStore.getState();
          const pendingDraft = useScenarioStore.getState().pendingDraft !== null;
          // Only a bare visit reads (and may clear) the remembered workspace.
          const bareVisit =
            !pendingDraft &&
            !params.get('project') &&
            !params.get('scenario') &&
            params.get('new') !== '1';
          const entry = workspaceEntry({
            params,
            pendingDraft,
            remembered: bareVisit ? rememberedForEntry() : null,
            projectIds: projects.map((project) => project.id),
            scenarioProjects: new Map(scenarios.map((item) => [item.id, item.project_id])),
            projectScenarios: projectScenarioMap(projects, scenarios),
          });
          if (entry.kind === 'projects') {
            navigateRef.current('/app/projects', { replace: true });
            return;
          }
          if (entry.kind === 'open') {
            requestedProject = entry.project;
            requestedId = entry.scenario;
          }
        }

        // `?tutorial=sunzia` is ignored until the tutorial player exists.
        if (params.get('new') === '1') setWizardOpen(true);

        if (requestedId) {
          const match = useScenarioStore
            .getState()
            .scenarios.find((scenario) => scenario.id === requestedId);
          if (!match) {
            toast.error('Scenario not found.');
          } else if (
            requestedProject &&
            match.project_id &&
            match.project_id !== requestedProject
          ) {
            toast.error('That scenario is not in this project.');
          } else {
            applyScenarioRef.current(match);
            if (match.project_id) goToWorkspace(match.project_id, match.id);
          }
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
    if (!ready) return;
    void refreshRequired();
  }, [activeScenarioId, ready, refreshRequired]);

  useEffect(() => {
    if (!ready || !data) return;
    scheduleRequired();
  }, [data, ready, scheduleRequired]);

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

  async function projectById(projectId: string): Promise<Project | undefined> {
    const found = (): Project | undefined =>
      useProjectStore.getState().projects.find((item) => item.id === projectId);
    const cached = found();
    if (cached) return cached;
    await useProjectStore.getState().loadProjects();
    return found();
  }

  async function openProjectCopy(projectId: string): Promise<void> {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      const copy = await useProjectStore.getState().duplicate(projectId);
      await useScenarioStore.getState().loadScenarios();
      const scenario = scenarioForWorkspace(copy, useScenarioStore.getState().scenarios);
      if (!scenario) {
        toast.error('The copied project has no scenario.');
        return;
      }
      goToWorkspace(copy.id, scenario.id);
      abandonDraft();
      updateDrawn(undefined);
      applyScenario(scenario);
      toast.success(`Opened your copy: ${copy.name}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      savingRef.current = false;
    }
  }

  function offerProjectDuplicate(projectId: string): void {
    toast('This project is read-only. Duplicate the project to edit your own copy.', {
      duration: Number.POSITIVE_INFINITY,
      action: {
        label: 'Duplicate project',
        onClick: () => {
          void openProjectCopy(projectId);
        },
      },
    });
  }

  async function handleSave(): Promise<void> {
    const active = useScenarioStore.getState().getActiveScenario();
    if (!active || savingRef.current) return;
    if (!active.project_id) {
      toast.error('This scenario is not in a project, so nothing was saved.');
      return;
    }
    const requestedProject = new URLSearchParams(window.location.search).get('project');
    const projectId = requestedProject || active.project_id;
    const project = await projectById(projectId);
    if (!project) {
      toast.error('This project is not loaded, so nothing was saved.');
      return;
    }
    const inProject = useScenarioStore
      .getState()
      .scenarios.filter((item) => item.project_id === project.id);
    if (saveAction(project, inProject, currentUserId ?? '') === 'offer_duplicate') {
      offerProjectDuplicate(project.id);
      return;
    }
    const requiredNow = requiredRef.current;
    const route = calculationRoute(drawn, active);
    if (!requiredNow || !canCalculate(requiredNow, route != null)) return;
    if (!useScenarioStore.getState().unsavedChanges && drawn === undefined) return;
    const rowWidthFt = currentRowWidthFt();
    if (route == null) {
      toast.error(ROUTE_REQUIRED);
      return;
    }
    if (rowWidthFt == null) {
      toast.error(currentWidthMessage());
      return;
    }
    savingRef.current = true;
    try {
      const changes = useFormStore.getState().getChanges();
      await saveScenario(
        active.id,
        changes,
        active.revision,
        drawn,
        rowWidthFt,
        pendingLineSelection !== undefined && pendingLineSelection !== null
          ? pendingLineSelection
          : undefined,
      );
      setPendingLineSelection(undefined);
      goToWorkspace(project.id, active.id);
      updateDrawn(undefined);
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
      updateDrawn({
        route: route ? { type: route.type, coordinates: route.coordinates } : null,
        segments,
      });
      if (useScenarioStore.getState().activeScenarioId) {
        setUnsavedChanges(true);
      }
    },
    [setUnsavedChanges],
  );

  const handleLineSelectionCommit = useCallback((selection: LineSelectionIn | null) => {
    setPendingLineSelection(selection);
    if (selection !== null) setUnsavedChanges(true);
  }, [setUnsavedChanges]);

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
    updateDrawn(undefined);
    useScenarioStore.setState({
      activeScenarioId: null,
      unsavedChanges: false,
      savedResults: null,
    });
    loadScenarioChanges(diffChanges(snapshot, fullInputs));
    useLineDataPrefill.getState().reset();
    setLineDataStale(false);
    setDraft({ name, source, fullInputs });
    setPendingSending(null);
    setTerminalPick('sending');
    lastStatusRef.current = 'Not calculated';
    setCalculationStatus('Not calculated');
    openInputsSubItem('routing', 'route');
    void refreshRequired();
  }

  function abandonDraft(): void {
    setDraft(null);
    setPendingSending(null);
    setTerminalPick(null);
  }

  function handlePickTerminal(terminal: DraftTerminal): void {
    if (terminalPick === 'sending') {
      setPendingSending(terminal);
      setTerminalPick('receiving');
      return;
    }
    if (terminalPick !== 'receiving') return;
    const sending = pendingSending;
    if (!sending) return;
    setDraft((current) => {
      if (!current || current.project_id) return current;
      return { ...current, terminals: { sending, receiving: terminal } };
    });
    setPendingSending(null);
    setTerminalPick(null);
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
    const route = calculationRoute(drawn, null);
    const requiredNow = requiredRef.current;
    if (!requiredNow || !canCalculate(requiredNow, route != null)) return;
    const rowWidthFt = currentRowWidthFt();
    if (route == null) {
      toast.error(ROUTE_REQUIRED);
      return;
    }
    if (rowWidthFt == null) {
      toast.error(currentWidthMessage());
      return;
    }
    if (!form.data || terrainMilesTotal(form.data) <= 0) return;
    savingRef.current = true;
    try {
      const changes = form.getChanges();
      let scenario: Scenario;
      if (draft.project_id) {
        scenario = await createScenario(
          draft.project_id,
          draft.name,
          draft.source,
          changes,
          plainRoute(route),
          drawn?.segments ?? null,
          rowWidthFt,
          pendingLineSelection ?? undefined,
        );
      } else if (draft.terminals) {
        const created = await createProjectWithScenario(
          {
            name: draft.name,
            source: draft.source,
            changes,
            terminals: draft.terminals,
          },
          changes,
          plainRoute(route),
          drawn?.segments ?? null,
          rowWidthFt,
          pendingLineSelection ?? undefined,
        );
        scenario = created.scenario;
      } else {
        toast.error('Pick the sending and receiving terminals before creating this project.');
        return;
      }
      abandonDraft();
      updateDrawn(undefined);
      setPendingLineSelection(undefined);
      applyScenario(scenario);
      if (scenario.project_id) goToWorkspace(scenario.project_id, scenario.id);
      toast.success(draft.project_id ? 'Scenario created' : 'Project created');
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
  const calculationAllowed =
    required !== null && canCalculate(required, routeDrawn);
  const routeInputReady = required !== null && canDraw(required);
  const activeProjectType = getValueAtPath(data ?? {}, `${PROJECT}.project_type`);
  const missingForCalculation = required === null ? [] : panelFields(required, routeDrawn);

  function openRequiredField(path: string): void {
    const target = sectionForRequiredPath(path, inputMetadata);
    if (!target) return;
    openInputsSubItem(target.sectionId, target.subItemId);
  }

  const locationProject =
    locationProjectId === null
      ? null
      : projects.find((item) => item.id === locationProjectId) ?? null;
  // Remember the open project workspace however it was opened (URL, toolbar,
  // wizard, draft import). The effect is the only place that writes it.
  const rememberProjectId = locationProject?.id ?? null;
  const rememberScenarioId =
    activeScenario && rememberProjectId && activeScenario.project_id === rememberProjectId
      ? activeScenario.id
      : null;
  useEffect(() => {
    if (!ready || !rememberProjectId || !rememberScenarioId) return;
    writeLastWorkspace(rememberProjectId, rememberScenarioId);
  }, [ready, rememberProjectId, rememberScenarioId]);

  const pickingNewProject = terminalPick !== null && draft !== null && !draft.project_id;
  const lineSelectEnabled =
    routeInputReady && !pickingNewProject && replacesExistingLine(activeProjectType);
  const drawingEnabled = routeInputReady && !pickingNewProject && !lineSelectEnabled;

  useEffect(() => {
    if (projectTypeRef.current === null) {
      projectTypeRef.current = activeProjectType;
      return;
    }
    if (projectTypeRef.current === activeProjectType) return;
    const prior = projectTypeRef.current;
    projectTypeRef.current = activeProjectType;
    if (replacesExistingLine(prior) !== replacesExistingLine(activeProjectType)) {
      updateDrawn({ route: null, segments: null });
      setPendingLineSelection(undefined);
    }
  }, [activeProjectType]);

  const footprintGids = ((): { sending: number | null; receiving: number | null } | null => {
    if (pickingNewProject) return null;
    if (draft?.terminals) {
      return {
        sending: draft.terminals.sending.substation_gid,
        receiving: draft.terminals.receiving.substation_gid,
      };
    }
    if (!locationProject) return null;
    return {
      sending: locationProject.sending_substation_gid,
      receiving: locationProject.receiving_substation_gid,
    };
  })();
  const footprintActive = footprintGids !== null;
  const sendingFootprintGid = footprintGids?.sending ?? null;
  const receivingFootprintGid = footprintGids?.receiving ?? null;
  useEffect(() => {
    if (!footprintActive) {
      setTerminalFootprints(null);
      return;
    }
    let cancelled = false;
    setTerminalFootprints(null);
    void Promise.all([
      footprintOrNull(sendingFootprintGid),
      footprintOrNull(receivingFootprintGid),
    ]).then(([sending, receiving]) => {
      if (!cancelled) setTerminalFootprints({ sending, receiving });
    });
    return () => {
      cancelled = true;
    };
  }, [footprintActive, sendingFootprintGid, receivingFootprintGid]);
  const mapTerminals = useMemo((): DrawTerminals | null => {
    if (pickingNewProject) return null;
    let base: DrawTerminals | null = null;
    if (draft?.terminals) {
      const { sending, receiving } = draft.terminals;
      if (!isLonLatPair(sending.point) || !isLonLatPair(receiving.point)) return null;
      base = {
        sending: sending.point,
        receiving: receiving.point,
        sendingName: sending.name,
        receivingName: receiving.name,
      };
    } else {
      base = locationProject ? projectDrawTerminals(locationProject) : null;
    }
    if (!base || !terminalFootprints) return base;
    return { ...base, footprints: terminalFootprints };
  }, [pickingNewProject, draft, locationProject, terminalFootprints]);
  const terminalMarkers = useMemo((): TerminalMarkerSpec[] => {
    if (mapTerminals) {
      return [
        { role: 'sending', name: mapTerminals.sendingName, point: mapTerminals.sending },
        { role: 'receiving', name: mapTerminals.receivingName, point: mapTerminals.receiving },
      ];
    }
    if (pendingSending && isLonLatPair(pendingSending.point)) {
      return [{ role: 'sending', name: pendingSending.name, point: pendingSending.point }];
    }
    return NO_TERMINAL_MARKERS;
  }, [mapTerminals, pendingSending]);
  const projectScenarios = locationProject
    ? scenarios.filter((item) => item.project_id === locationProject.id)
    : [];
  const projectReadOnly = locationProject
    ? isProjectReadOnly(locationProject, projectScenarios, currentUserId ?? '')
    : false;
  const pendingDelete =
    scenarios.find((item) => item.id === pendingDeleteId) ?? null;
  const renameTrimmed = renameValue.trim();

  function handleSelectTab(id: string): void {
    if (!locationProject) return;
    const scenario = scenarios.find(
      (item) => item.id === id && item.project_id === locationProject.id,
    );
    if (!scenario) return;
    abandonDraft();
    updateDrawn(undefined);
    applyScenario(scenario);
    goToWorkspace(locationProject.id, scenario.id);
  }

  async function handleDuplicateTab(id: string): Promise<void> {
    if (!locationProject) return;
    const action = duplicateAction(projectReadOnly, id);
    if (action === 'offer_project_duplicate') {
      offerProjectDuplicate(locationProject.id);
      return;
    }
    if (action === 'none') return;
    try {
      const copy = await duplicateScenario(id);
      abandonDraft();
      updateDrawn(undefined);
      applyScenario(copy);
      if (copy.project_id) goToWorkspace(copy.project_id, copy.id);
      toast.success('Scenario duplicated');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  function handleNewScenario(): void {
    if (!locationProject) return;
    if (projectReadOnly) {
      offerProjectDuplicate(locationProject.id);
      return;
    }
    const pending = newScenarioFromDefaults(
      locationProject.id,
      projectScenarios.map((item) => item.name),
    );
    useScenarioStore.getState().setPendingDraft(pending);
    if (!useFormStore.getState().defaults) return;
    const consumed = useScenarioStore.getState().consumePendingDraft();
    if (!consumed) return;
    beginImportedDraft(consumed);
  }

  function handleTabRename(id: string): void {
    if (!locationProject || projectReadOnly) return;
    const scenario = projectScenarios.find((item) => item.id === id);
    if (!scenario) return;
    setRenamingId(id);
    setRenameValue(scenario.name);
  }

  async function submitTabRename(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!renamingId) return;
    const name = renameValue.trim();
    if (!name) return;
    const scenario = useScenarioStore.getState().scenarios.find((item) => item.id === renamingId);
    if (!scenario) return;
    try {
      if (name !== scenario.name) {
        await renameScenario(scenario.id, name, scenario.revision);
      }
      setRenamingId(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  function handleTabDelete(id: string): void {
    if (!locationProject || projectReadOnly || projectScenarios.length <= 1) return;
    setPendingDeleteId(id);
  }

  async function confirmTabDelete(): Promise<void> {
    if (!pendingDeleteId || !locationProject) return;
    const id = pendingDeleteId;
    const projectId = locationProject.id;
    const deletedWasActive = activeScenarioId === id;
    try {
      await deleteScenario(id);
      await useProjectStore.getState().loadProjects();
      if (deletedWasActive) {
        const remaining = useScenarioStore
          .getState()
          .scenarios.filter((item) => item.project_id === projectId);
        const projectNow =
          useProjectStore.getState().projects.find((item) => item.id === projectId) ??
          locationProject;
        const next = scenarioForWorkspace(projectNow, remaining);
        if (next) {
          abandonDraft();
          updateDrawn(undefined);
          applyScenario(next);
          goToWorkspace(projectId, next.id);
        }
      }
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  function handleCompare(): void {
    if (!locationProjectId) return;
    navigate(`/app/projects/${locationProjectId}/compare`);
  }

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
            canCreate={canCreate && calculationAllowed}
            canCalculate={calculationAllowed}
            onCalculate={() => { void runCalculation(); }}
            onCreate={() => { void handleCreate(); }}
            locationProjectId={locationProjectId}
            scenarioToolbar={
              locationProject
                ? {
                    project: locationProject,
                    scenarios: projectScenarios,
                    activeId: activeScenarioId ?? '',
                    readOnly: projectReadOnly,
                    onSelect: handleSelectTab,
                    onDuplicate: (id) => { void handleDuplicateTab(id); },
                    onNew: handleNewScenario,
                    onRename: handleTabRename,
                    onDelete: handleTabDelete,
                    onCompare: handleCompare,
                  }
                : null
            }
          />
          <BeforeCalculationPanel fields={missingForCalculation} onOpen={openRequiredField} />
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
                    {lineDataStale ? (
                      <div
                        className="absolute inset-x-0 top-0 z-30 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900"
                        role="status"
                      >
                        This line&apos;s data has changed; select it again to update the route
                      </div>
                    ) : null}
                    <MapPanel
                      key={activeScenarioId ?? (draft ? 'draft' : 'none')}
                      createMode={draft !== null}
                      drawingEnabled={drawingEnabled}
                      lineSelectEnabled={lineSelectEnabled}
                      existingRoute={
                        draft
                          ? calculationRoute(drawn, null)
                          : calculationRoute(drawn, activeScenario)
                      }
                      initialSelectedGids={
                        activeScenario?.line_selection?.gids ?? undefined
                      }
                      storedConnectors={
                        activeScenario?.line_selection?.connectors ?? undefined
                      }
                      terminalSubstations={footprintGids ?? undefined}
                      onRouteChange={handleRouteChange}
                      onLineSelectionCommit={handleLineSelectionCommit}
                      onAnalyzed={() => { void refreshRequired(); }}
                      terminalMarkers={terminalMarkers}
                      drawTerminals={mapTerminals}
                      terminalPick={pickingNewProject ? terminalPick : null}
                      onPickTerminal={handlePickTerminal}
                      storedLineGids={activeScenario?.line_selection?.gids}
                      onLineDataStaleChange={setLineDataStale}
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
                      <SectionDispatcher
                        subItemId={subItemId}
                        milesFromRoute={milesFromRoute}
                        routeDrawn={routeDrawn}
                      />
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
                  {showLegacyBanner(activeScenario, drawn) ? <LegacyBanner /> : null}
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
      <Dialog
        open={renamingId !== null}
        onOpenChange={(open) => {
          if (!open) setRenamingId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Scenario</DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={(event) => { void submitTabRename(event); }}>
            <div className="grid gap-2">
              <Label htmlFor="rename-tab-scenario-name">Name</Label>
              <Input
                id="rename-tab-scenario-name"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                autoComplete="off"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenamingId(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!renameTrimmed}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        title="Delete Scenario"
        description={
          pendingDelete
            ? `Delete "${pendingDelete.name}"? This cannot be undone.`
            : 'Delete this scenario? This cannot be undone.'
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => { void confirmTabDelete(); }}
      />
    </div>
  );
}
