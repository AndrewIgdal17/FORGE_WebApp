import type { Geometry, MultiLineString } from 'geojson';

import { analyzeRequestBody } from '@/lib/analyze-request';
import { supabase } from '@/lib/supabase';

export interface CalculatorInfo {
  package: string;
  version: string;
  commit: string | null;
  defaults_id: string;
}

export interface HealthResponse {
  status: string;
  app_commit: string | null;
  calculator: CalculatorInfo;
}

export interface DefaultsResponse {
  calculator: CalculatorInfo;
  defaults: Record<string, unknown>;
}

export interface GridMixShares {
  coal: number;
  oil: number;
  natural_gas: number;
  solar: number;
  wind: number;
  hydro: number;
  nuclear: number;
  other: number;
}

export interface GridMixPreset {
  id: string;
  label: string;
  description: string;
  grid_mix: {
    initial: GridMixShares;
    rate_pre_cod: GridMixShares;
    rate_post_cod: GridMixShares;
  };
}

export type GridMixPresetsResponse = GridMixPreset[];

export interface TaxonomyItem {
  id: string;
  side: string;
  category: string;
  subgroup: string;
  label: string;
  discount_rate: string | null;
  condition: string | null;
  display_order: number;
  description: string;
}

export interface TaxonomyResponse {
  items: TaxonomyItem[];
  dimensions: Record<string, string[]>;
  excludable_groups: Record<
    string,
    { id: string; label: string; taxonomy_ids: string[] }
  >;
  bcr_families: Record<string, { id: string; label: string; order: number }>;
  bcr_definitions: Record<string, Record<string, unknown>>;
}

export interface InputFieldMetadata {
  id: string;
  taxonomy_id: string;
  input_tab: string;
  yaml_section: string;
  field_path: string;
  label: string;
  help_text: string | null;
  unit: string | null;
  input_type: string;
  condition: string | null;
  validation: Record<string, unknown>;
  display_order: number;
  section_label: string | null;
  tier: string;
  sub_tab: string | null;
}

export type InputMetadataResponse = InputFieldMetadata[];

export interface CalculateRequest {
  defaults_id: string;
  changes: Record<string, unknown>;
  route: MultiLineString;
  row_width_ft: number;
  scenario_id?: string;
}

export interface CalculateResponse {
  success: boolean;
  scenario_id: string;
  timestamp: string;
  results: Record<string, unknown>;
  layer_releases?: Record<string, string>;
  error: null;
}

export type RequiredField = {
  path: string;
  label: string;
  stage: 'before_route' | 'after_route';
  message: string;
};

export type RequiredResponse = {
  before_route: RequiredField[];
  after_route: RequiredField[];
};

export interface AnalyzeResponse {
  total_miles: number;
  intersections: Record<string, Record<string, unknown>>;
  changes: Record<string, unknown>;
  sending_subregion: string | null;
  receiving_subregion: string | null;
  sending_gea: string | null;
  receiving_gea: string | null;
  sending_state: string | null;
  receiving_state: string | null;
  open_water_miles?: number;
}

export interface ScenarioCreate {
  name: string;
  source: string;
  defaults_id: string;
  changes: Record<string, unknown>;
  route: Record<string, unknown>;
  segments?: unknown[] | null;
  row_width_ft: number;
}

export interface ScenarioUpdate {
  revision: number;
  name?: string;
  defaults_id?: string;
  changes?: Record<string, unknown>;
  route?: Record<string, unknown> | null;
  segments?: unknown[] | null;
  row_width_ft?: number;
}

export interface ScenarioResponse {
  id: string;
  user_id: string;
  name: string;
  source: string;
  defaults_id: string;
  changes: Record<string, unknown>;
  results: Record<string, unknown> | null;
  calculator: CalculatorInfo | null;
  inputs_id: string | null;
  computed_at: string | null;
  calc_error: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
  route: Record<string, unknown> | null;
  segments: unknown[] | null;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(formatErrorBody(body));
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatErrorBody(body: unknown): string {
  if (typeof body === 'string' && body.length > 0) {
    return body;
  }
  if (isRecord(body)) {
    if (typeof body.detail === 'string' && body.detail.length > 0) {
      return body.detail;
    }
    const nested = body.error;
    if (isRecord(nested) && typeof nested.message === 'string' && nested.message.length > 0) {
      return nested.message;
    }
  }
  if (body === undefined || body === null || body === '') {
    return 'Request failed';
  }
  return JSON.stringify(body);
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(options?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (options?.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    throw new ApiError(response.status, await readBody(response));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await readBody(response)) as T;
}

export async function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/api/health');
}

export async function getCalculatorInfo(): Promise<CalculatorInfo> {
  return apiFetch<CalculatorInfo>('/api/calculator');
}

export async function getDefaults(): Promise<DefaultsResponse> {
  return apiFetch<DefaultsResponse>('/api/defaults');
}

export async function getGridMixPresets(): Promise<GridMixPresetsResponse> {
  return apiFetch<GridMixPresetsResponse>('/api/presets/grid_mix');
}

export async function getTaxonomy(): Promise<TaxonomyResponse> {
  return apiFetch<TaxonomyResponse>('/api/taxonomy');
}

export async function getInputMetadata(): Promise<InputMetadataResponse> {
  return apiFetch<InputMetadataResponse>('/api/input_metadata');
}

export async function calculate(
  payload: CalculateRequest,
): Promise<CalculateResponse> {
  return apiFetch<CalculateResponse>('/api/forge/calculate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function requiredInputs(
  changes: Record<string, unknown>,
): Promise<RequiredResponse> {
  return apiFetch<RequiredResponse>('/api/forge/required', {
    method: 'POST',
    body: JSON.stringify({ changes }),
  });
}

const ANALYZE_TIMEOUT_MS = 30_000;

export async function analyzeRoute(
  route: MultiLineString,
  rowWidthFt: number,
  signal?: AbortSignal,
): Promise<AnalyzeResponse> {
  const timeout = AbortSignal.timeout(ANALYZE_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  return apiFetch<AnalyzeResponse>('/api/route/analyze', {
    method: 'POST',
    body: JSON.stringify(analyzeRequestBody(route, rowWidthFt)),
    signal: combined,
  });
}

export async function createScenario(
  payload: ScenarioCreate,
): Promise<ScenarioResponse> {
  return apiFetch<ScenarioResponse>('/api/scenarios', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateScenario(
  id: string,
  payload: ScenarioUpdate,
): Promise<ScenarioResponse> {
  return apiFetch<ScenarioResponse>(`/api/scenarios/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteScenario(id: string): Promise<void> {
  await apiFetch<void>(`/api/scenarios/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export type PhaseADecision =
  | 'same_facility_hifld'
  | 'same_facility_osm'
  | 'same_facility_hifld_osm'
  | 'same_facility_osm_hifld'
  | 'different_facility';

export type PhaseAStoredDecision =
  | 'same_facility_hifld'
  | 'same_facility_osm'
  | 'same_facility_hifld_osm'
  | 'same_facility_osm_hifld'
  | 'different_facility';

export interface AuditModelOutput {
  prediction: string;
  confidence: number;
  proba: Record<string, number>;
}

export interface AuditPredictions {
  ready: boolean;
  models: {
    logistic_regression: AuditModelOutput;
    random_forest: AuditModelOutput;
    xgboost: AuditModelOutput;
    adaboost: AuditModelOutput;
  };
  ensemble: {
    prediction: string;
    agreement: string;
  };
  ensemble_weighted: {
    prediction: string;
    agreement: string;
  };
}

export interface AuditAccuracyPoint {
  n: number;
  lr: number;
  rf: number;
  xgb: number;
  ada: number;
  ensemble: number;
  ensemble_weighted: number;
}

export interface AuditStats {
  n_decisions: number;
  decision_counts: Record<PhaseAStoredDecision, number>;
  remaining: number;
  ready: boolean;
  accuracy: AuditAccuracyPoint | null;
  accuracy_history: AuditAccuracyPoint[];
  best_params: Record<string, Record<string, unknown>>;
}

export interface PhaseAMismatch {
  done: false;
  sub_gid: number;
  hifld_id: number;
  osm_id: number;
  hifld_name: string;
  osm_original_name: string | null;
  merged_name: string | null;
  hifld_voltage_kv: number | null;
  osm_voltage_kv: number | null;
  hifld_type: string | null;
  osm_type: string | null;
  distance_m: number;
  boundary_distance_m: number;
  osm_area_sqm: number;
  compactness: number;
  orientation_deg: number;
  corridor_degree: number;
  nearby_hifld: number;
  nearby_osm: number;
  state: string | null;
  county: string | null;
  voltage_match: number;
  state_match: boolean;
  hifld_geojson: Geometry;
  osm_geojson: Geometry;
  predictions: AuditPredictions | null;
}

export interface AuditQueueEmpty {
  done: true;
}

export type AuditNextResponse = PhaseAMismatch | AuditQueueEmpty;

export interface AuditDecideRequest {
  sub_gid: number;
  decision: PhaseADecision;
}

export interface AuditDecideResponse {
  stats: AuditStats;
  predictions: AuditPredictions | null;
  next: AuditNextResponse;
}

export function isAuditMismatch(value: AuditNextResponse): value is PhaseAMismatch {
  return value.done === false;
}

export async function getAuditNext(): Promise<AuditNextResponse> {
  return apiFetch<AuditNextResponse>('/api/audit/next');
}

export async function getAuditStats(): Promise<AuditStats> {
  return apiFetch<AuditStats>('/api/audit/stats');
}

export async function decideAudit(payload: AuditDecideRequest): Promise<AuditDecideResponse> {
  return apiFetch<AuditDecideResponse>('/api/audit/decide', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
