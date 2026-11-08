import { create } from 'zustand';

import { resolvedRowWidthFt, rowWidthProblem } from '@/lib/analyze-request';
import {
  createScenario as createScenarioApi,
  getDefaults,
  updateScenario as updateScenarioApi,
  deleteScenario as deleteScenarioApi,
} from '@/lib/api';
import type { ScenarioResponse } from '@/lib/api';
import { acceptedForge, diffChanges, forgeDocument } from '@/lib/changes';
import { csvEscape, parseCsvLine } from '@/lib/csv';
import { loadLookups, type ProjectFields } from '@/lib/lookups';
import { flattenObject, getValueAtPath, setValueAtPath } from '@/lib/path';
import { routeFromSegments } from '@/lib/route-geometry';
import { supabase } from '@/lib/supabase';

export interface Scenario {
  id: string;
  name: string;
  source: string;
  defaults_id: string;
  changes: Record<string, unknown>;
  results: Record<string, unknown> | null;
  calculator: Record<string, unknown> | null;
  inputs_id: string | null;
  computed_at: string | null;
  calc_error: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  ownerUsername?: string;
  route: Record<string, unknown> | null;
  segments: unknown[] | null;
}

export interface ScenarioGeometry {
  route: Record<string, unknown> | null;
  segments: unknown[] | null;
}

export interface ScenarioDraft {
  name: string;
  source: string;
  changes: Record<string, unknown>;
}

interface ScenarioStore {
  scenarios: Scenario[];
  activeScenarioId: string | null;
  unsavedChanges: boolean;
  loading: boolean;
  savedResults: Record<string, unknown> | null;
  pendingDraft: ScenarioDraft | null;

  loadScenarios: () => Promise<void>;
  setActiveScenario: (id: string) => void;
  createScenario: (
    name: string,
    source: string,
    changes: Record<string, unknown>,
    route?: Record<string, unknown> | null,
    segments?: unknown[] | null,
    rowWidthFt?: number,
  ) => Promise<Scenario>;
  saveScenario: (
    id: string,
    changes: Record<string, unknown>,
    revision: number,
    geometry?: ScenarioGeometry,
    rowWidthFt?: number,
  ) => Promise<Scenario>;
  renameScenario: (
    id: string,
    name: string,
    revision: number,
  ) => Promise<Scenario>;
  duplicateScenario: (id: string) => Promise<Scenario>;
  deleteScenario: (id: string) => Promise<void>;
  setUnsavedChanges: (value: boolean) => void;
  setPendingDraft: (draft: ScenarioDraft) => void;
  consumePendingDraft: () => ScenarioDraft | null;
  getActiveScenario: () => Scenario | null;
}

const SCENARIO_SPECIFIC_SECTIONS = new Set([
  '01_project_technical_details',
  '03_financing',
  '05_delays',
  '17_congestion_reductions',
]);

const NEW_SCENARIO_BLANK_FIELDS: Array<{ path: string; value: unknown }> = [
  { path: '01_project_technical_details.project.construction_type', value: null },
  { path: '01_project_technical_details.project.ac_dc', value: null },
  { path: '01_project_technical_details.project.capacity_mw', value: null },
  { path: '01_project_technical_details.project.conductor_type', value: null },
  { path: '01_project_technical_details.project.old_ac_dc', value: null },
  { path: '01_project_technical_details.project.old_capacity_mw', value: null },
  { path: '01_project_technical_details.project.old_conductor_type', value: null },
  { path: '01_project_technical_details.project.old_converter_type', value: null },
  { path: '01_project_technical_details.timeline.construction_years', value: 0 },
  { path: '01_project_technical_details.timeline.delay_years', value: 0 },
];

const RESULTS_EXPORT_FIELDS: Array<{ key: string; path: string }> = [
  { key: 'capacity_mw', path: 'technical_parameters.capacity_mw' },
  { key: 'line_length_miles', path: 'technical_parameters.line_length_miles' },
  { key: 'project_lifetime_years', path: 'technical_parameters.project_lifetime_years' },
  { key: 'delay_years', path: 'technical_parameters.delay_years' },
  { key: 'build_cost_pv', path: 'costs.build.total_pv' },
  { key: 'acquisition_pv', path: 'costs.row.acquisition_pv' },
  { key: 'row_rent_pv', path: 'costs.row.row_rent_pv' },
  { key: 'env_mitigation_pv', path: 'costs.environmental.total_pv' },
  { key: 'total_capital_pv', path: 'summary.total_capital_pv' },
  { key: 'insurance_pv', path: 'costs.insurance.pv_total' },
  { key: 'oandm_pv', path: 'costs.oandm.total_pv' },
  { key: 'total_operational_pv', path: 'summary.total_operational_pv' },
  { key: 'wildfire_pv', path: 'costs.wildfire.pv_cost' },
  { key: 'outage_pv', path: 'costs.outage.pv_cost' },
  { key: 'total_risk_pv', path: 'summary.total_risk_pv' },
  { key: 'delay_pv', path: 'costs.delay.total_pv' },
  { key: 'line_loss_pv', path: 'costs.line_loss.total_pv' },
  { key: 'emissions_pv', path: 'costs.emissions.total_pv' },
  { key: 'fac_emissions_project_pv', path: 'bcr.fac_emissions_project_pv' },
  { key: 'displacement_avoided_benefit_pv', path: 'bcr.displacement_avoided_benefit_pv' },
  { key: 'total_energy_emissions_pv', path: 'summary.total_energy_emissions_pv' },
  { key: 'grand_total_cost_pv', path: 'summary.total_costs_pv' },
  { key: 'hard_costs_pv', path: 'bcr.hard_costs_pv' },
  { key: 'soft_costs_pv', path: 'bcr.soft_costs_pv' },
  { key: 'emissions_costs_pv', path: 'bcr.emissions_costs_pv' },
  { key: 'revenue_pv', path: 'bcr.capital_recovery_pv' },
  { key: 'bcr_societal', path: 'bcr.bcr_societal' },
  { key: 'bcr_utility', path: 'bcr.bcr_utility' },
  { key: 'bcr_ratepayer', path: 'bcr.bcr_ratepayer' },
  { key: 'net_benefit_pv', path: 'bcr.net_benefit_pv' },
  { key: 'net_benefit_utility_pv', path: 'bcr.net_benefit_utility_pv' },
  { key: 'net_benefit_ratepayer_pv', path: 'bcr.net_benefit_ratepayer_pv' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asChanges(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asRecordOrNull(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

/** PostGIS `select('*')` returns geometry as a hex EWKB string, not GeoJSON. */
function asRoute(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string' || !isRecord(value)) return null;
  return value;
}

function asSegments(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || value.length === 0) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function routePayload(
  route: Record<string, unknown> | null,
  segments: unknown[] | null,
): Record<string, unknown> | null {
  if (route) return deepClone(route);
  const rebuilt = routeFromSegments(segments);
  if (!rebuilt) return null;
  return { type: rebuilt.type, coordinates: rebuilt.coordinates };
}

const PROJECT_FIELDS = '01_project_technical_details.project';

function positiveWidth(rowWidthFt: number | undefined): rowWidthFt is number {
  return typeof rowWidthFt === 'number' && rowWidthFt > 0;
}

function readProjectString(data: Record<string, unknown>, key: string): string {
  const value = getValueAtPath(data, `${PROJECT_FIELDS}.${key}`);
  return typeof value === 'string' ? value : '';
}

function projectFieldsFromDocument(data: Record<string, unknown>): ProjectFields {
  const capacity = getValueAtPath(data, `${PROJECT_FIELDS}.capacity_mw`);
  const fields: ProjectFields = {
    constructionType: readProjectString(data, 'construction_type'),
    acDc: readProjectString(data, 'ac_dc'),
    capacityMw:
      typeof capacity === 'number' && Number.isFinite(capacity) ? capacity : 0,
    conductorType: readProjectString(data, 'conductor_type'),
  };
  const converter = readProjectString(data, 'converter_type');
  if (converter) fields.converterType = converter;
  return fields;
}

function rowWidthForDocument(
  defaults: Record<string, unknown>,
  changes: Record<string, unknown>,
): { width: number | null; problem: string | null } {
  const data = structuredClone(defaults);
  for (const [path, value] of Object.entries(changes)) {
    setValueAtPath(data, path, value);
  }
  const fields = projectFieldsFromDocument(data);
  const lookups = loadLookups(defaults);
  return {
    width: resolvedRowWidthFt(fields, lookups),
    problem: rowWidthProblem(fields, lookups),
  };
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function fromResponse(row: ScenarioResponse, ownerUsername?: string): Scenario {
  return {
    id: row.id,
    name: row.name,
    source: row.source,
    defaults_id: row.defaults_id,
    changes: asChanges(row.changes),
    results: asRecordOrNull(row.results),
    calculator: asRecordOrNull(row.calculator),
    inputs_id: row.inputs_id,
    computed_at: row.computed_at,
    calc_error: row.calc_error,
    revision: row.revision,
    created_at: row.created_at,
    updated_at: row.updated_at,
    user_id: row.user_id,
    ownerUsername,
    route: asRoute(row.route),
    segments: asSegments(row.segments),
  };
}

function rowToScenario(
  row: Record<string, unknown>,
  usernames: Map<string, string>,
): Scenario {
  const userId = typeof row.user_id === 'string' ? row.user_id : '';
  return {
    id: typeof row.id === 'string' ? row.id : '',
    name: typeof row.name === 'string' ? row.name : '',
    source: typeof row.source === 'string' ? row.source : '',
    defaults_id: typeof row.defaults_id === 'string' ? row.defaults_id : '',
    changes: asChanges(row.changes),
    results: asRecordOrNull(row.results),
    calculator: asRecordOrNull(row.calculator),
    inputs_id: typeof row.inputs_id === 'string' ? row.inputs_id : null,
    computed_at: typeof row.computed_at === 'string' ? row.computed_at : null,
    calc_error: typeof row.calc_error === 'string' ? row.calc_error : null,
    revision: typeof row.revision === 'number' ? row.revision : Number(row.revision ?? 0),
    created_at: typeof row.created_at === 'string' ? row.created_at : '',
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : '',
    user_id: userId,
    ownerUsername: usernames.get(userId),
    route: asRoute(row.route),
    segments: asSegments(row.segments),
  };
}

function upsertScenario(scenarios: Scenario[], next: Scenario): Scenario[] {
  const index = scenarios.findIndex((scenario) => scenario.id === next.id);
  if (index === -1) return [next, ...scenarios];
  const copy = scenarios.slice();
  copy[index] = next;
  return copy;
}

function downloadBasename(name: string): string {
  return (name || 'scenario').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function triggerDownload(contents: string, mime: string, filename: string): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function applyChangesToDefaults(
  defaults: Record<string, unknown>,
  changes: Record<string, unknown>,
): Record<string, unknown> {
  const result = deepClone(defaults);
  for (const [path, value] of Object.entries(changes)) {
    const segments = path
      .split(/\.|\[(\d+)\]\.?/)
      .filter((segment): segment is string => Boolean(segment));
    if (segments.length === 0) continue;
    let current: unknown = result;
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      const key: string | number = /^\d+$/.test(segment) ? Number(segment) : segment;
      if (!isRecord(current) && !Array.isArray(current)) break;
      const container = current as Record<string | number, unknown>;
      if (container[key] == null) {
        container[key] = /^\d+$/.test(segments[i + 1] ?? '') ? [] : {};
      }
      current = container[key];
    }
    const last = segments[segments.length - 1];
    const lastKey: string | number = /^\d+$/.test(last) ? Number(last) : last;
    if (isRecord(current) || Array.isArray(current)) {
      (current as Record<string | number, unknown>)[lastKey] = value;
    }
  }
  return result;
}

function terrainMiles(physical: unknown): Record<string, unknown> | null {
  if (!isRecord(physical)) return null;
  const terrain = physical.terrain;
  if (!isRecord(terrain)) return null;
  return isRecord(terrain.terrain_miles) ? terrain.terrain_miles : null;
}

function assembleFullInputs(
  snapshotData: Record<string, unknown>,
  overrides: Record<string, unknown>,
  scenarioInputs: Record<string, unknown>,
): Record<string, unknown> {
  const full = deepClone(snapshotData);
  for (const [path, value] of Object.entries(overrides)) {
    setValueAtPath(full, path, value);
  }
  const hasInputs = Object.keys(scenarioInputs).length > 0;
  if (hasInputs) {
    for (const section of SCENARIO_SPECIFIC_SECTIONS) {
      if (scenarioInputs[section]) {
        full[section] = deepClone(scenarioInputs[section]);
      }
    }
    const miles = terrainMiles(scenarioInputs['02_project_physical_details']);
    if (miles) {
      const physical = isRecord(full['02_project_physical_details'])
        ? full['02_project_physical_details']
        : {};
      const terrain = isRecord(physical.terrain) ? physical.terrain : {};
      terrain.terrain_miles = deepClone(miles);
      physical.terrain = terrain;
      full['02_project_physical_details'] = physical;
    }
  } else {
    for (const field of NEW_SCENARIO_BLANK_FIELDS) {
      setValueAtPath(full, field.path, field.value);
    }
    const miles = terrainMiles(full['02_project_physical_details']);
    if (miles) {
      for (const key of Object.keys(miles)) miles[key] = 0;
    }
  }
  return full;
}

function extractScenarioInputs(
  fullData: Record<string, unknown>,
): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  for (const section of SCENARIO_SPECIFIC_SECTIONS) {
    if (fullData[section]) inputs[section] = deepClone(fullData[section]);
  }
  const miles = terrainMiles(fullData['02_project_physical_details']);
  if (miles) {
    inputs['02_project_physical_details'] = {
      terrain: { terrain_miles: deepClone(miles) },
    };
  }
  return inputs;
}

function diffObjects(
  ref: unknown,
  current: unknown,
  path: string,
  overrides: Record<string, unknown>,
  skipPaths?: Set<string>,
): void {
  if (skipPaths?.has(path)) return;
  if (ref === current) return;
  if (
    ref == null ||
    current == null ||
    typeof ref !== 'object' ||
    typeof current !== 'object'
  ) {
    if (ref !== current) overrides[path] = current;
    return;
  }
  const refRecord = ref as Record<string, unknown>;
  const currentRecord = current as Record<string, unknown>;
  const keys = new Set([
    ...Object.keys(refRecord),
    ...Object.keys(currentRecord),
  ]);
  for (const key of keys) {
    diffObjects(
      refRecord[key],
      currentRecord[key],
      path + '.' + key,
      overrides,
      skipPaths,
    );
  }
}

function computeOverrides(
  fullData: Record<string, unknown>,
  snapshotData: Record<string, unknown>,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  const refSections = Object.keys(snapshotData).filter(
    (key) => !SCENARIO_SPECIFIC_SECTIONS.has(key),
  );
  for (const section of refSections) {
    if (section === '02_project_physical_details') {
      diffObjects(
        snapshotData[section],
        fullData[section],
        section,
        overrides,
        new Set(['02_project_physical_details.terrain.terrain_miles']),
      );
    } else {
      diffObjects(snapshotData[section], fullData[section], section, overrides);
    }
  }
  return overrides;
}

function coerceCsvValue(raw: string): unknown {
  if (raw !== '' && !Number.isNaN(Number(raw))) return Number(raw);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return raw;
}

function parseCsvSections(text: string): Record<string, string[]> {
  const sections: Record<string, string[]> = {};
  let currentSection: string | null = null;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    const header = trimmed.match(/^\[([A-Z]+)\]$/);
    if (header) {
      currentSection = header[1];
      sections[currentSection] = [];
    } else if (currentSection && trimmed) {
      sections[currentSection].push(trimmed);
    }
  }
  return sections;
}

function parseMetadata(lines: string[]): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const line of lines) {
    const parts = parseCsvLine(line);
    if (parts.length >= 2 && parts[0]) {
      metadata[parts[0]] = parts.slice(1).join(',');
    }
  }
  return metadata;
}

function parsePathValueRows(lines: string[] | undefined): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  if (!lines || lines.length < 2) return values;
  for (let i = 1; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i]);
    if (parts.length >= 2) {
      setValueAtPath(values, parts[0], coerceCsvValue(parts[1]));
    }
  }
  return values;
}

function parseOverrideRows(lines: string[] | undefined): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  if (!lines || lines.length < 2) return overrides;
  for (let i = 1; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i]);
    if (parts.length >= 2) {
      overrides[parts[0]] = coerceCsvValue(parts[1]);
    }
  }
  return overrides;
}

export function generateScenarioName(
  baseName: string,
  existingNames: string[],
): string {
  if (!existingNames.includes(baseName)) return baseName;
  let counter = 2;
  while (existingNames.includes(`${baseName} (${counter})`)) counter++;
  return `${baseName} (${counter})`;
}

export function getActiveScenario(state: {
  scenarios: Scenario[];
  activeScenarioId: string | null;
}): Scenario | null {
  if (!state.activeScenarioId) return null;
  return state.scenarios.find((scenario) => scenario.id === state.activeScenarioId) ?? null;
}

export function exportAsForge(
  scenario: Scenario,
  defaults: Record<string, unknown>,
  defaultsId: string,
  calculatorInfo: unknown,
): void {
  const fullInputs = applyChangesToDefaults(defaults, scenario.changes);
  const changes = diffChanges(defaults, fullInputs);
  const document = forgeDocument(
    scenario.name,
    calculatorInfo,
    defaultsId,
    changes,
    scenario.results,
  );
  triggerDownload(
    JSON.stringify(document, null, 2),
    'application/json',
    downloadBasename(scenario.name) + '.forge',
  );
}

export function exportAsCsv(
  scenario: Scenario,
  defaults: Record<string, unknown>,
): void {
  const fullInputs = applyChangesToDefaults(defaults, scenario.changes);
  const slimInputs = extractScenarioInputs(fullInputs);
  const overrides = computeOverrides(fullInputs, defaults);

  let csv = '';
  csv += '[METADATA]\n';
  csv += 'version,2.0\n';
  csv += 'customName,' + csvEscape(scenario.name || '') + '\n';
  csv += 'timestamp,' + (scenario.updated_at || new Date().toISOString()) + '\n';
  csv += '\n';

  csv += '[INPUTS]\n';
  csv += 'path,value\n';
  for (const sectionKey of Object.keys(slimInputs)) {
    const section = slimInputs[sectionKey];
    if (!isRecord(section)) continue;
    for (const row of flattenObject(section, sectionKey)) {
      csv += csvEscape(row.path) + ',' + csvEscape(String(row.value ?? '')) + '\n';
    }
  }
  csv += '\n';

  if (Object.keys(overrides).length > 0) {
    csv += '[OVERRIDES]\n';
    csv += 'path,value\n';
    for (const [path, value] of Object.entries(overrides)) {
      csv += csvEscape(path) + ',' + csvEscape(String(value ?? '')) + '\n';
    }
    csv += '\n';
  }

  if (scenario.results) {
    csv += '[RESULTS]\n';
    csv += 'key,value\n';
    for (const field of RESULTS_EXPORT_FIELDS) {
      const value = getValueAtPath(scenario.results, field.path);
      if (value != null) {
        csv += csvEscape(field.key) + ',' + csvEscape(String(value)) + '\n';
      }
    }
  }

  triggerDownload(csv, 'text/csv', downloadBasename(scenario.name) + '.csv');
}

export function importForgeFile(text: string, fileName: string): ScenarioDraft {
  const data = acceptedForge(JSON.parse(text));
  const name = data.customName || fileName.replace(/\.forge$/i, '');
  return {
    name,
    source: 'upload-forge',
    changes: asChanges(data.changes),
  };
}

export function importCsvFile(
  text: string,
  fileName: string,
  defaults: Record<string, unknown>,
): ScenarioDraft {
  const sections = parseCsvSections(text);
  if (!sections.METADATA) {
    throw new Error('Invalid CSV: missing [METADATA] section');
  }
  const metadata = parseMetadata(sections.METADATA);
  const isV2 = metadata.version === '2.0';
  let inputs: Record<string, unknown>;
  if (isV2) {
    const scenarioInputs = parsePathValueRows(sections.INPUTS);
    const overrides = parseOverrideRows(sections.OVERRIDES);
    inputs = assembleFullInputs(defaults, overrides, scenarioInputs);
  } else {
    inputs = deepClone(defaults);
    if (sections.INPUTS && sections.INPUTS.length > 1) {
      for (let i = 1; i < sections.INPUTS.length; i++) {
        const parts = parseCsvLine(sections.INPUTS[i]);
        if (parts.length >= 3) {
          setValueAtPath(
            inputs,
            parts[0] + '.' + parts[1],
            coerceCsvValue(parts[2]),
          );
        }
      }
    }
  }
  const name = metadata.customName || fileName.replace(/\.csv$/i, '');
  return {
    name,
    source: 'upload-csv',
    changes: diffChanges(defaults, inputs),
  };
}

export const useScenarioStore = create<ScenarioStore>((set, get) => ({
  scenarios: [],
  activeScenarioId: null,
  unsavedChanges: false,
  loading: false,
  savedResults: null,
  pendingDraft: null,

  loadScenarios: async () => {
    set({ loading: true });
    try {
      const [scenarioRes, profileRes] = await Promise.all([
        supabase
          .from('scenario')
          .select('*')
          .order('updated_at', { ascending: false }),
        supabase.from('profiles').select('id, username, org'),
      ]);
      if (scenarioRes.error) {
        throw new Error(scenarioRes.error.message);
      }
      const usernames = new Map<string, string>();
      if (!profileRes.error) {
        for (const profile of (profileRes.data ?? []) as Array<Record<string, unknown>>) {
          const id = profile.id;
          const username = profile.username;
          if (typeof id === 'string' && typeof username === 'string' && username) {
            usernames.set(id, username);
          }
        }
      }
      const scenarios = ((scenarioRes.data ?? []) as Array<Record<string, unknown>>).map(
        (row) => rowToScenario(row, usernames),
      );
      set({ scenarios, loading: false });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  setActiveScenario: (id) => {
    const scenario = get().scenarios.find((item) => item.id === id);
    set({
      activeScenarioId: id,
      unsavedChanges: false,
      savedResults: scenario?.results ?? null,
    });
  },

  createScenario: async (name, source, changes, route, segments, rowWidthFt) => {
    if (route == null || !positiveWidth(rowWidthFt)) {
      throw new Error(
        route == null
          ? 'A drawn route inside the lower 48 is required.'
          : 'row_width_ft must be a positive number',
      );
    }
    const defaults = await getDefaults();
    const row = await createScenarioApi({
      name,
      source,
      defaults_id: defaults.calculator.defaults_id,
      changes,
      route,
      row_width_ft: rowWidthFt,
      ...(segments !== undefined ? { segments } : {}),
    });
    const ownerUsername = get().scenarios.find(
      (scenario) => scenario.user_id === row.user_id,
    )?.ownerUsername;
    const scenario = fromResponse(row, ownerUsername);
    set((state) => ({ scenarios: upsertScenario(state.scenarios, scenario) }));
    return scenario;
  },

  saveScenario: async (id, changes, revision, geometry, rowWidthFt) => {
    const current = get().scenarios.find((scenario) => scenario.id === id);
    const route =
      geometry !== undefined
        ? geometry.route
        : routePayload(current?.route ?? null, current?.segments ?? null);
    if (route == null || !positiveWidth(rowWidthFt)) {
      throw new Error(
        route == null
          ? 'A drawn route inside the lower 48 is required.'
          : 'row_width_ft must be a positive number',
      );
    }
    const row = await updateScenarioApi(id, {
      revision,
      changes,
      row_width_ft: rowWidthFt,
      ...(current
        ? { name: current.name, defaults_id: current.defaults_id }
        : {}),
      ...(geometry
        ? { route: geometry.route, segments: geometry.segments }
        : { route }),
    });
    const scenario = fromResponse(row, current?.ownerUsername);
    set((state) => ({
      scenarios: upsertScenario(state.scenarios, scenario),
      unsavedChanges: false,
      savedResults: scenario.results,
    }));
    return scenario;
  },

  renameScenario: async (id, name, revision) => {
    const current = get().scenarios.find((scenario) => scenario.id === id);
    const row = await updateScenarioApi(id, { name, revision });
    const scenario = fromResponse(row, current?.ownerUsername);
    set((state) => ({ scenarios: upsertScenario(state.scenarios, scenario) }));
    return scenario;
  },

  duplicateScenario: async (id) => {
    const source = get().scenarios.find((scenario) => scenario.id === id);
    if (!source) throw new Error('Scenario not found');
    const name = generateScenarioName(
      `${source.name} (copy)`,
      get().scenarios.map((scenario) => scenario.name),
    );
    const defaults = await getDefaults();
    const { width: rowWidthFt, problem } = rowWidthForDocument(
      defaults.defaults,
      source.changes,
    );
    if (rowWidthFt == null && problem) throw new Error(problem);
    return get().createScenario(
      name,
      'manual',
      deepClone(source.changes),
      routePayload(source.route, source.segments),
      source.segments == null ? null : deepClone(source.segments),
      rowWidthFt ?? undefined,
    );
  },

  deleteScenario: async (id) => {
    await deleteScenarioApi(id);
    set((state) => ({
      scenarios: state.scenarios.filter((scenario) => scenario.id !== id),
      activeScenarioId: state.activeScenarioId === id ? null : state.activeScenarioId,
    }));
  },

  setUnsavedChanges: (value) => {
    set({ unsavedChanges: value });
  },

  setPendingDraft: (draft) => {
    set({ pendingDraft: draft });
  },

  consumePendingDraft: () => {
    const draft = get().pendingDraft;
    if (!draft) return null;
    set({ pendingDraft: null });
    return draft;
  },

  getActiveScenario: () => getActiveScenario(get()),
}));
