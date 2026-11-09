import { create } from 'zustand';

import { getDefaults, getInputMetadata, getTaxonomy } from '@/lib/api';
import { diffChanges } from '@/lib/changes';
import { loadLookups, type LookupTables, type ProjectFields } from '@/lib/lookups';
import { getValueAtPath, setValueAtPath } from '@/lib/path';

export interface FormState {
  data: Record<string, unknown> | null;
  defaults: Record<string, unknown> | null;
  defaultsId: string | null;
  taxonomy: unknown | null;
  taxonomyById: Record<string, unknown>;
  taxonomyBySide: Record<string, unknown[]>;
  taxonomyByCategory: Record<string, unknown[]>;
  inputMetadata: unknown[] | null;
  lookups: LookupTables | null;
  loading: boolean;
  calculatorInfo: Record<string, unknown> | null;
}

export interface FormActions {
  loadAll: () => Promise<void>;
  setFieldValue: (path: string, value: unknown) => void;
  getFieldValue: (path: string) => unknown;
  resetFieldToDefault: (path: string) => void;
  resetSectionToDefaults: (sectionPath: string) => void;
  loadScenarioChanges: (changes: Record<string, unknown>) => void;
  applyChanges: (changes: Record<string, unknown>) => void;
  getChanges: () => Record<string, unknown>;
  getProjectFields: () => ProjectFields;
  isReconductoring: () => boolean;
}

const PROJECT_PATH = '01_project_technical_details.project';

interface TaxonomyIndexes {
  taxonomyById: Record<string, unknown>;
  taxonomyBySide: Record<string, unknown[]>;
  taxonomyByCategory: Record<string, unknown[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  return structuredClone(value);
}

function indexTaxonomy(taxonomy: unknown): TaxonomyIndexes {
  const taxonomyById: Record<string, unknown> = {};
  const taxonomyBySide: Record<string, unknown[]> = {};
  const taxonomyByCategory: Record<string, unknown[]> = {};
  const items = isRecord(taxonomy) && Array.isArray(taxonomy.items) ? taxonomy.items : [];

  for (const item of items) {
    if (!isRecord(item)) continue;
    if (typeof item.id === 'string') taxonomyById[item.id] = item;
    if (typeof item.side === 'string') {
      (taxonomyBySide[item.side] ??= []).push(item);
    }
    if (typeof item.category === 'string') {
      (taxonomyByCategory[item.category] ??= []).push(item);
    }
  }

  return { taxonomyById, taxonomyBySide, taxonomyByCategory };
}

function withPath(
  data: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const next = structuredClone(data);
  setValueAtPath(next, path, cloneValue(value));
  return next;
}

function readString(data: Record<string, unknown> | null, path: string): string {
  if (!data) return '';
  const value = getValueAtPath(data, path);
  return typeof value === 'string' ? value : '';
}

function readNumber(data: Record<string, unknown> | null, path: string): number {
  if (!data) return 0;
  const value = getValueAtPath(data, path);
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readOptionalString(
  data: Record<string, unknown> | null,
  path: string,
): string | undefined {
  if (!data) return undefined;
  const value = getValueAtPath(data, path);
  return typeof value === 'string' ? value : undefined;
}

function readOptionalNumber(
  data: Record<string, unknown> | null,
  path: string,
): number | undefined {
  if (!data) return undefined;
  const value = getValueAtPath(data, path);
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function projectFields(data: Record<string, unknown> | null): ProjectFields {
  const fields: ProjectFields = {
    constructionType: readString(data, `${PROJECT_PATH}.construction_type`),
    acDc: readString(data, `${PROJECT_PATH}.ac_dc`),
    capacityMw: readNumber(data, `${PROJECT_PATH}.capacity_mw`),
    conductorType: readString(data, `${PROJECT_PATH}.conductor_type`),
  };

  const converterType = readOptionalString(data, `${PROJECT_PATH}.converter_type`);
  if (converterType !== undefined) fields.converterType = converterType;

  const oldAcDc = readOptionalString(data, `${PROJECT_PATH}.old_ac_dc`);
  if (oldAcDc !== undefined) fields.oldAcDc = oldAcDc;

  const oldCapacityMw = readOptionalNumber(data, `${PROJECT_PATH}.old_capacity_mw`);
  if (oldCapacityMw !== undefined) fields.oldCapacityMw = oldCapacityMw;

  const oldConductorType = readOptionalString(data, `${PROJECT_PATH}.old_conductor_type`);
  if (oldConductorType !== undefined) fields.oldConductorType = oldConductorType;

  const oldConverterType = readOptionalString(data, `${PROJECT_PATH}.old_converter_type`);
  if (oldConverterType !== undefined) fields.oldConverterType = oldConverterType;

  return fields;
}

const initialState: FormState = {
  data: null,
  defaults: null,
  defaultsId: null,
  taxonomy: null,
  taxonomyById: {},
  taxonomyBySide: {},
  taxonomyByCategory: {},
  inputMetadata: null,
  lookups: null,
  loading: false,
  calculatorInfo: null,
};

export const useFormStore = create<FormState & FormActions>((set, get) => ({
  ...initialState,

  loadAll: async () => {
    set({ loading: true });
    try {
      const defaultsResponse = await getDefaults();
      const defaults = structuredClone(defaultsResponse.defaults);
      const calculator = defaultsResponse.calculator;
      set({
        defaults,
        defaultsId: calculator.defaults_id,
        calculatorInfo: {
          package: calculator.package,
          version: calculator.version,
          commit: calculator.commit,
          defaults_id: calculator.defaults_id,
        },
      });

      const taxonomy = await getTaxonomy();
      set({ taxonomy, ...indexTaxonomy(taxonomy) });

      const inputMetadata: unknown[] = (await getInputMetadata()).slice();
      set({ inputMetadata });

      set({ lookups: loadLookups(defaults) });
      set({ data: structuredClone(defaults) });
    } finally {
      set({ loading: false });
    }
  },

  setFieldValue: (path, value) => {
    const { data } = get();
    if (!data) return;
    set({ data: withPath(data, path, value) });
  },

  getFieldValue: (path) => {
    const { data } = get();
    if (!data) return undefined;
    return getValueAtPath(data, path);
  },

  resetFieldToDefault: (path) => {
    const { data, defaults } = get();
    if (!data || !defaults) return;
    set({ data: withPath(data, path, getValueAtPath(defaults, path)) });
  },

  resetSectionToDefaults: (sectionPath) => {
    const { data, defaults } = get();
    if (!data || !defaults) return;
    set({
      data: withPath(data, sectionPath, getValueAtPath(defaults, sectionPath)),
    });
  },

  loadScenarioChanges: (changes) => {
    const { defaults } = get();
    if (!defaults) return;
    const data = structuredClone(defaults);
    for (const [path, value] of Object.entries(changes)) {
      setValueAtPath(data, path, cloneValue(value));
    }
    set({ data });
  },

  applyChanges: (changes) => {
    const { data } = get();
    if (!data) return;
    const entries = Object.entries(changes);
    if (entries.length === 0) return;
    const next = structuredClone(data);
    for (const [path, value] of entries) {
      setValueAtPath(next, path, cloneValue(value));
    }
    set({ data: next });
  },

  getChanges: () => {
    const { defaults, data } = get();
    if (!defaults || !data) return {};
    return diffChanges(defaults, data);
  },

  getProjectFields: () => projectFields(get().data),

  isReconductoring: () => {
    const { data } = get();
    if (!data) return false;
    const projectType = getValueAtPath(data, `${PROJECT_PATH}.project_type`);
    return projectType === 'reconductoring';
  },
}));
