import { useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CAPACITY_OPTIONS_BY_AC_DC,
  CONDUCTOR_TYPE_BY_CONSTRUCTION,
} from '@/data/configs';
import { getValueAtPath, setValueAtPath } from '@/lib/path';
import { cn } from '@/lib/utils';

export interface ScenarioWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultsSnapshot: Record<string, unknown> | null;
  onComplete: (
    name: string,
    fullInputs: Record<string, unknown>,
    metadata: { timestamp: string; source: string },
  ) => void;
}

type ProjectType = 'greenfield' | 'reconductoring';
type AcDc = '' | 'AC' | 'DC';
type StepKind = 'name' | 'project' | 'existing' | 'route';

interface TerrainOption {
  key: string;
  label: string;
}

interface RowZone {
  miles: number;
  acquisitionCost: number;
  rentCost: number;
  holdCost: number;
}

interface WizardState {
  step: number;
  name: string;
  projectType: ProjectType;
  constructionType: string;
  acDc: AcDc;
  capacityMw: number | null;
  conductorType: string;
  converterType: string;
  numberOfConverters: number | null;
  oldAcDc: AcDc;
  oldCapacityMw: number | null;
  oldConductorType: string;
  oldConverterType: string;
  constructionYears: number;
  delayYears: number;
  projectLifetime: number;
  terrainMiles: Record<string, number>;
  zones: RowZone[];
  visibleZones: number;
  snapshotError: string;
}

const CONSTRUCTION_TYPES = [
  'Overhead',
  'Underground Direct-Buried',
  'Underground Tunnel',
  'Subsea',
] as const;

const CONVERTER_OPTIONS = ['LCC Converter', 'VSC Converter'] as const;

const TERRAINS: readonly TerrainOption[] = [
  { key: 'forested', label: 'Forested' },
  { key: 'scrubbed_flat', label: 'Scrubbed Flat' },
  { key: 'wetland', label: 'Wetland' },
  { key: 'farmland', label: 'Farmland' },
  { key: 'desert_barren', label: 'Desert/Barren' },
  { key: 'urban', label: 'Urban' },
  { key: 'rolling_hills', label: 'Rolling Hills' },
  { key: 'mountain', label: 'Mountain' },
  { key: 'subsea', label: 'Subsea' },
];

/** BLM zone schedule used when the defaults snapshot has no cost for a zone. */
const ZONE_COST_DEFAULTS: readonly (readonly [number, number, number])[] = [
  [299, 8, 0.8],
  [579, 15, 2],
  [1132, 30, 3],
  [1706, 45, 4],
  [2350, 62, 6],
  [3394, 89, 9],
  [4746, 125, 12],
  [6583, 173, 17],
  [16279, 428, 43],
  [50000, 1315, 132],
  [100000, 2630, 263],
  [250000, 6575, 658],
  [500000, 13150, 1315],
  [750000, 19725, 1972],
  [1000000, 26300, 2630],
];

const ZONE_COUNT = 15;
const INITIAL_VISIBLE_ZONES = 5;
const MILES_TOLERANCE = 0.01;

const STEP_COPY: Record<StepKind, { title: string; description: string }> = {
  name: {
    title: 'Name your scenario',
    description:
      'This identifies your scenario in the comparison table and exports. You can rename it later.',
  },
  project: {
    title: 'Define your project',
    description: 'Choose how the line is built, then set capacity and conductor.',
  },
  existing: {
    title: 'Existing line details',
    description: 'Construction years, delay years, and lifetime for the existing line.',
  },
  route: {
    title: 'Define your route',
    description: 'Terrain miles must equal right-of-way miles.',
  },
};

function emptyTerrainMiles(): Record<string, number> {
  const miles: Record<string, number> = {};
  for (const terrain of TERRAINS) miles[terrain.key] = 0;
  return miles;
}

function readNumber(
  snapshot: Record<string, unknown> | null,
  path: string,
  fallback: number,
): number {
  if (!snapshot) return fallback;
  const value = getValueAtPath(snapshot, path);
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function initialZones(snapshot: Record<string, unknown> | null): RowZone[] {
  return ZONE_COST_DEFAULTS.map(([acquisitionCost, rentCost, holdCost], index) => {
    const base = `11_project_row_details.right_of_way.zone_${index + 1}`;
    return {
      miles: 0,
      acquisitionCost: readNumber(snapshot, `${base}.acquisition_cost`, acquisitionCost),
      rentCost: readNumber(snapshot, `${base}.rent_cost`, rentCost),
      holdCost: readNumber(snapshot, `${base}.hold_cost`, holdCost),
    };
  });
}

function createInitialState(snapshot: Record<string, unknown> | null): WizardState {
  return {
    step: 0,
    name: '',
    projectType: 'greenfield',
    constructionType: '',
    acDc: '',
    capacityMw: null,
    conductorType: '',
    converterType: '',
    numberOfConverters: null,
    oldAcDc: '',
    oldCapacityMw: null,
    oldConductorType: '',
    oldConverterType: '',
    constructionYears: 3,
    delayYears: 0,
    projectLifetime: 40,
    terrainMiles: emptyTerrainMiles(),
    zones: initialZones(snapshot),
    visibleZones: INITIAL_VISIBLE_ZONES,
    snapshotError: '',
  };
}

function totalSteps(projectType: ProjectType): number {
  return projectType === 'reconductoring' ? 4 : 3;
}

function stepKindAt(step: number, projectType: ProjectType): StepKind {
  if (step <= 0) return 'name';
  if (step === 1) return 'project';
  if (projectType === 'reconductoring' && step === 2) return 'existing';
  return 'route';
}

function visibleTerrains(constructionType: string): readonly TerrainOption[] {
  if (constructionType === 'Subsea') {
    return TERRAINS.filter((terrain) => terrain.key === 'subsea');
  }
  return TERRAINS.filter((terrain) => terrain.key !== 'subsea');
}

function terrainTotal(state: WizardState): number {
  return visibleTerrains(state.constructionType).reduce(
    (sum, terrain) => sum + (state.terrainMiles[terrain.key] || 0),
    0,
  );
}

function rowTotal(state: WizardState): number {
  return state.zones
    .slice(0, state.visibleZones)
    .reduce((sum, zone) => sum + (zone.miles || 0), 0);
}

function totalsMatch(state: WizardState): boolean {
  return Math.abs(terrainTotal(state) - rowTotal(state)) <= MILES_TOLERANCE;
}

function hasTerrainMiles(state: WizardState): boolean {
  return visibleTerrains(state.constructionType).some(
    (terrain) => (state.terrainMiles[terrain.key] || 0) > 0,
  );
}

function dcFieldsValid(
  acDc: AcDc,
  converterType: string,
  numberOfConverters: number | null,
): boolean {
  if (acDc !== 'DC') return true;
  return converterType.length > 0 && numberOfConverters != null && numberOfConverters >= 1;
}

function projectStepValid(state: WizardState): boolean {
  if (
    !state.constructionType ||
    !state.acDc ||
    state.capacityMw == null ||
    !state.conductorType
  ) {
    return false;
  }
  if (!dcFieldsValid(state.acDc, state.converterType, state.numberOfConverters)) return false;
  if (state.projectType !== 'reconductoring') return true;
  if (!state.oldAcDc || state.oldCapacityMw == null || !state.oldConductorType) return false;
  if (state.oldAcDc === 'DC' && !state.oldConverterType) return false;
  return true;
}

function existingStepValid(state: WizardState): boolean {
  return state.constructionYears >= 1 && state.delayYears >= 0 && state.projectLifetime >= 1;
}

function routeStepValid(state: WizardState): boolean {
  return hasTerrainMiles(state) && totalsMatch(state);
}

function validateCurrentStep(state: WizardState): boolean {
  const kind = stepKindAt(state.step, state.projectType);
  switch (kind) {
    case 'name':
      return state.name.trim().length > 0;
    case 'project':
      return projectStepValid(state);
    case 'existing':
      return existingStepValid(state);
    case 'route':
      return routeStepValid(state);
  }
}

function formatMiles(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function parseNonNegative(raw: string): number {
  const value = Number.parseFloat(raw);
  if (Number.isNaN(value)) return 0;
  return Math.max(0, value);
}

function parseInteger(raw: string): number {
  const value = Number.parseInt(raw, 10);
  return Number.isNaN(value) ? 0 : value;
}

function conductorOptions(constructionType: string): readonly string[] {
  return CONDUCTOR_TYPE_BY_CONSTRUCTION[constructionType] ?? [];
}

function capacityOptions(acDc: AcDc): readonly number[] {
  if (acDc !== 'AC' && acDc !== 'DC') return [];
  return CAPACITY_OPTIONS_BY_AC_DC[acDc];
}

function mergeWizardIntoSnapshot(
  snapshot: Record<string, unknown>,
  state: WizardState,
): Record<string, unknown> {
  const full = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
  const visible = new Set(visibleTerrains(state.constructionType).map((terrain) => terrain.key));

  setValueAtPath(full, '01_project_technical_details.project.construction_type', state.constructionType);
  setValueAtPath(full, '01_project_technical_details.project.ac_dc', state.acDc);
  setValueAtPath(full, '01_project_technical_details.project.capacity_mw', state.capacityMw);
  setValueAtPath(full, '01_project_technical_details.project.conductor_type', state.conductorType);
  setValueAtPath(
    full,
    '01_project_technical_details.project.converter_type',
    state.acDc === 'AC' ? 'NA' : state.converterType,
  );
  setValueAtPath(
    full,
    '01_project_technical_details.project.number_of_converters',
    state.acDc === 'DC' ? (state.numberOfConverters ?? 0) : 0,
  );
  setValueAtPath(
    full,
    '01_project_technical_details.project.reconductoring',
    state.projectType === 'reconductoring',
  );
  setValueAtPath(
    full,
    '01_project_technical_details.timeline.construction_years',
    state.constructionYears,
  );
  setValueAtPath(full, '01_project_technical_details.timeline.delay_years', state.delayYears);
  setValueAtPath(
    full,
    '01_project_technical_details.timeline.project_lifetime',
    state.projectLifetime,
  );

  if (state.projectType === 'reconductoring') {
    setValueAtPath(full, '01_project_technical_details.project.old_ac_dc', state.oldAcDc);
    setValueAtPath(
      full,
      '01_project_technical_details.project.old_capacity_mw',
      state.oldCapacityMw,
    );
    setValueAtPath(
      full,
      '01_project_technical_details.project.old_conductor_type',
      state.oldConductorType,
    );
    if (state.oldAcDc === 'DC') {
      setValueAtPath(
        full,
        '01_project_technical_details.project.old_converter_type',
        state.oldConverterType,
      );
    }
  }

  for (const terrain of TERRAINS) {
    const miles = visible.has(terrain.key) ? state.terrainMiles[terrain.key] || 0 : 0;
    setValueAtPath(
      full,
      `02_project_physical_details.terrain.terrain_miles.${terrain.key}`,
      miles,
    );
  }

  state.zones.forEach((zone, index) => {
    const base = `11_project_row_details.right_of_way.zone_${index + 1}`;
    const visibleZone = index < state.visibleZones;
    setValueAtPath(full, `${base}.miles`, visibleZone ? zone.miles || 0 : 0);
    setValueAtPath(full, `${base}.acquisition_cost`, zone.acquisitionCost);
    setValueAtPath(full, `${base}.rent_cost`, zone.rentCost);
    setValueAtPath(full, `${base}.hold_cost`, zone.holdCost);
  });

  return full;
}

function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: ReactElement | ReactElement[];
  hint?: string;
}): ReactElement {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function RadioGroup({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={name}>
      {options.map((option) => {
        const id = `${name}-${option.value}`;
        const checked = value === option.value;
        return (
          <label
            key={option.value}
            htmlFor={id}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm',
              checked ? 'border-primary bg-primary/5' : 'border-input',
            )}
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

function OptionSelect({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <Field label={label} htmlFor={id}>
      <Select
        modal={false}
        value={value || null}
        onValueChange={(next) => onChange(next ?? '')}
        disabled={disabled || options.length === 0}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="— Select —" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function NumberField({
  id,
  label,
  value,
  min,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  value: number | null;
  min: number;
  hint?: string;
  onChange: (value: number) => void;
}): ReactElement {
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <Input
        id={id}
        type="number"
        min={min}
        step={1}
        value={value ?? ''}
        onChange={(event) => onChange(parseInteger(event.target.value))}
      />
    </Field>
  );
}

function StepIndicator({ step, total }: { step: number; total: number }): ReactElement {
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>
        Step {step + 1} of {total}
      </span>
      <span className="flex items-center gap-1.5" aria-hidden="true">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={cn(
              'size-2.5 rounded-full border',
              index <= step ? 'border-primary bg-primary' : 'border-muted-foreground/40',
            )}
          />
        ))}
      </span>
    </div>
  );
}

function NameStep({
  name,
  onNameChange,
  onAdvance,
  onClose,
}: {
  name: string;
  onNameChange: (name: string) => void;
  onAdvance: () => void;
  onClose: () => void;
}): ReactElement {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter' && name.trim().length > 0) {
      event.preventDefault();
      onAdvance();
    }
    if (event.key === 'Escape') onClose();
  }

  return (
    <Field label="Scenario name" htmlFor="wizard-name">
      <Input
        id="wizard-name"
        value={name}
        placeholder="Scenario name"
        autoFocus
        autoComplete="off"
        onChange={(event) => onNameChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
    </Field>
  );
}

function ProjectStep({
  state,
  onChange,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
}): ReactElement {
  const capacities = capacityOptions(state.acDc);
  const conductors = conductorOptions(state.constructionType);
  const oldCapacities = capacityOptions(state.oldAcDc);
  const oldConductors = conductorOptions(state.constructionType);

  return (
    <div className="grid gap-4">
      <Field label="Project type">
        <RadioGroup
          name="wizard-project-type"
          value={state.projectType}
          options={[
            { value: 'greenfield', label: 'Greenfield (new build)' },
            { value: 'reconductoring', label: 'Reconductoring (existing corridor)' },
          ]}
          onChange={(value) => onChange({ projectType: value as ProjectType })}
        />
      </Field>
      <OptionSelect
        id="wizard-construction"
        label="Construction type"
        value={state.constructionType}
        options={CONSTRUCTION_TYPES.map((value) => ({ value, label: value }))}
        onChange={(constructionType) => {
          const allowed = conductorOptions(constructionType);
          onChange({
            constructionType,
            conductorType: allowed.includes(state.conductorType) ? state.conductorType : '',
            oldConductorType: allowed.includes(state.oldConductorType)
              ? state.oldConductorType
              : '',
          });
        }}
      />
      <Field label="AC / DC">
        <RadioGroup
          name="wizard-acdc"
          value={state.acDc}
          options={[
            { value: 'AC', label: 'AC' },
            { value: 'DC', label: 'DC' },
          ]}
          onChange={(value) => {
            const acDc = value as AcDc;
            const allowed = capacityOptions(acDc);
            onChange({
              acDc,
              capacityMw:
                state.capacityMw != null && allowed.includes(state.capacityMw)
                  ? state.capacityMw
                  : null,
              converterType: acDc === 'AC' ? '' : state.converterType,
              numberOfConverters: acDc === 'AC' ? null : state.numberOfConverters,
            });
          }}
        />
      </Field>
      <OptionSelect
        id="wizard-capacity"
        label="Capacity (MW)"
        value={state.capacityMw == null ? '' : String(state.capacityMw)}
        disabled={capacities.length === 0}
        options={capacities.map((mw) => ({ value: String(mw), label: String(mw) }))}
        onChange={(value) =>
          onChange({ capacityMw: value ? Number.parseInt(value, 10) : null })
        }
      />
      <OptionSelect
        id="wizard-conductor"
        label="Conductor type"
        value={state.conductorType}
        disabled={conductors.length === 0}
        options={conductors.map((value) => ({ value, label: value }))}
        onChange={(conductorType) => onChange({ conductorType })}
      />
      {state.acDc === 'DC' ? (
        <>
          <Field label="Converter type">
            <RadioGroup
              name="wizard-converter"
              value={state.converterType}
              options={CONVERTER_OPTIONS.map((value) => ({ value, label: value }))}
              onChange={(converterType) => onChange({ converterType })}
            />
          </Field>
          <NumberField
            id="wizard-converter-count"
            label="Number of converters"
            value={state.numberOfConverters}
            min={1}
            onChange={(numberOfConverters) =>
              onChange({ numberOfConverters: numberOfConverters >= 1 ? numberOfConverters : null })
            }
          />
        </>
      ) : null}
      {state.projectType === 'reconductoring' ? (
        <>
          <Field label="Old AC / DC">
            <RadioGroup
              name="wizard-old-acdc"
              value={state.oldAcDc}
              options={[
                { value: 'AC', label: 'AC' },
                { value: 'DC', label: 'DC' },
              ]}
              onChange={(value) => {
                const oldAcDc = value as AcDc;
                const allowed = capacityOptions(oldAcDc);
                onChange({
                  oldAcDc,
                  oldCapacityMw:
                    state.oldCapacityMw != null && allowed.includes(state.oldCapacityMw)
                      ? state.oldCapacityMw
                      : null,
                  oldConverterType: oldAcDc === 'AC' ? '' : state.oldConverterType,
                });
              }}
            />
          </Field>
          <OptionSelect
            id="wizard-old-capacity"
            label="Old capacity (MW)"
            value={state.oldCapacityMw == null ? '' : String(state.oldCapacityMw)}
            disabled={oldCapacities.length === 0}
            options={oldCapacities.map((mw) => ({ value: String(mw), label: String(mw) }))}
            onChange={(value) =>
              onChange({ oldCapacityMw: value ? Number.parseInt(value, 10) : null })
            }
          />
          <OptionSelect
            id="wizard-old-conductor"
            label="Old conductor"
            value={state.oldConductorType}
            disabled={oldConductors.length === 0}
            options={oldConductors.map((value) => ({ value, label: value }))}
            onChange={(oldConductorType) => onChange({ oldConductorType })}
          />
          {state.oldAcDc === 'DC' ? (
            <Field label="Old converter">
              <RadioGroup
                name="wizard-old-converter"
                value={state.oldConverterType}
                options={CONVERTER_OPTIONS.map((value) => ({ value, label: value }))}
                onChange={(oldConverterType) => onChange({ oldConverterType })}
              />
            </Field>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ExistingLineStep({
  state,
  onChange,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
}): ReactElement {
  return (
    <div className="grid gap-4">
      <NumberField
        id="wizard-construction-years"
        label="Construction years"
        value={state.constructionYears}
        min={1}
        onChange={(constructionYears) => onChange({ constructionYears: Math.max(0, constructionYears) })}
      />
      <NumberField
        id="wizard-delay-years"
        label="Delay years"
        value={state.delayYears}
        min={0}
        onChange={(delayYears) => onChange({ delayYears: Math.max(0, delayYears) })}
      />
      <NumberField
        id="wizard-lifetime"
        label="Project lifetime"
        value={state.projectLifetime}
        min={1}
        hint="Operating years after commercial operation date."
        onChange={(projectLifetime) => onChange({ projectLifetime: Math.max(0, projectLifetime) })}
      />
    </div>
  );
}

function RouteStep({
  state,
  onChange,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
}): ReactElement {
  const terrains = visibleTerrains(state.constructionType);
  const terrainMilesTotal = terrainTotal(state);
  const rowMilesTotal = rowTotal(state);
  const showMismatch =
    (terrainMilesTotal > 0 || rowMilesTotal > 0) &&
    Math.abs(terrainMilesTotal - rowMilesTotal) > MILES_TOLERANCE;
  const visibleZones = state.zones.slice(0, state.visibleZones);

  function setTerrain(key: string, miles: number): void {
    onChange({ terrainMiles: { ...state.terrainMiles, [key]: miles } });
  }

  function setZone(index: number, patch: Partial<RowZone>): void {
    const zones = state.zones.map((zone, zoneIndex) =>
      zoneIndex === index ? { ...zone, ...patch } : zone,
    );
    onChange({ zones });
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h3 className="text-sm font-medium">Terrain miles</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Terrain</th>
                <th className="py-2 font-medium">Miles</th>
              </tr>
            </thead>
            <tbody>
              {terrains.map((terrain) => (
                <tr key={terrain.key} className="border-b border-border/60">
                  <td className="py-2 pr-3">{terrain.label}</td>
                  <td className="py-2">
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      aria-label={`${terrain.label} miles`}
                      value={state.terrainMiles[terrain.key] || 0}
                      onChange={(event) => setTerrain(terrain.key, parseNonNegative(event.target.value))}
                    />
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-2 pr-3 font-medium">Total</td>
                <td className="py-2 font-medium tabular-nums">{formatMiles(terrainMilesTotal)} mi</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-2">
        <h3 className="text-sm font-medium">ROW zones</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Zone</th>
                <th className="py-2 pr-3 font-medium">Miles</th>
                <th className="py-2 pr-3 font-medium">Acquisition</th>
                <th className="py-2 pr-3 font-medium">Rent</th>
                <th className="py-2 font-medium">Hold</th>
              </tr>
            </thead>
            <tbody>
              {visibleZones.map((zone, index) => (
                <tr key={index} className="border-b border-border/60">
                  <td className="py-2 pr-3 whitespace-nowrap">Zone {index + 1}</td>
                  <td className="py-2 pr-3">
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      aria-label={`Zone ${index + 1} miles`}
                      value={zone.miles || 0}
                      onChange={(event) =>
                        setZone(index, { miles: parseNonNegative(event.target.value) })
                      }
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      aria-label={`Zone ${index + 1} acquisition cost`}
                      value={zone.acquisitionCost}
                      onChange={(event) =>
                        setZone(index, { acquisitionCost: parseNonNegative(event.target.value) })
                      }
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      aria-label={`Zone ${index + 1} rent cost`}
                      value={zone.rentCost}
                      onChange={(event) =>
                        setZone(index, { rentCost: parseNonNegative(event.target.value) })
                      }
                    />
                  </td>
                  <td className="py-2">
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      aria-label={`Zone ${index + 1} hold cost`}
                      value={zone.holdCost}
                      onChange={(event) =>
                        setZone(index, { holdCost: parseNonNegative(event.target.value) })
                      }
                    />
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-2 pr-3 font-medium">Total</td>
                <td className="py-2 font-medium tabular-nums" colSpan={4}>
                  {formatMiles(rowMilesTotal)} miles
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex gap-2">
          {state.visibleZones < ZONE_COUNT ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                onChange({ visibleZones: Math.min(state.visibleZones + 1, ZONE_COUNT) })
              }
            >
              + Add Zone
            </Button>
          ) : null}
          {state.visibleZones > 1 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => onChange({ visibleZones: state.visibleZones - 1 })}
            >
              Remove Zone
            </Button>
          ) : null}
        </div>
      </div>

      {showMismatch ? (
        <p className="text-sm text-destructive" role="alert">
          Terrain miles ({formatMiles(terrainMilesTotal)}) and ROW miles (
          {formatMiles(rowMilesTotal)}) must match.
        </p>
      ) : null}
    </div>
  );
}

export function ScenarioWizard({
  open,
  onOpenChange,
  defaultsSnapshot,
  onComplete,
}: ScenarioWizardProps): ReactElement {
  const [state, setState] = useState<WizardState>(() => createInitialState(defaultsSnapshot));
  const [seenOpen, setSeenOpen] = useState(open);
  if (open !== seenOpen) {
    setSeenOpen(open);
    if (open) setState(createInitialState(defaultsSnapshot));
  }

  const steps = totalSteps(state.projectType);
  const kind = stepKindAt(Math.min(state.step, steps - 1), state.projectType);
  const copy = STEP_COPY[kind];
  const onLast = state.step >= steps - 1;
  const canAdvance = validateCurrentStep({ ...state, step: Math.min(state.step, steps - 1) });

  function patch(next: Partial<WizardState>): void {
    setState((prev) => {
      const merged = { ...prev, ...next, snapshotError: '' };
      if (next.projectType && next.projectType !== prev.projectType) {
        merged.step = Math.min(prev.step, totalSteps(next.projectType) - 1);
      }
      return merged;
    });
  }

  function goBack(): void {
    setState((prev) => ({ ...prev, step: Math.max(0, prev.step - 1), snapshotError: '' }));
  }

  function goNext(): void {
    if (!validateCurrentStep(state)) return;
    setState((prev) => ({ ...prev, step: prev.step + 1 }));
  }

  function complete(): void {
    if (!validateCurrentStep(state)) return;
    if (!defaultsSnapshot) {
      setState((prev) => ({
        ...prev,
        snapshotError: 'Reference data is not loaded yet. Please wait a moment and try again.',
      }));
      return;
    }
    const fullInputs = mergeWizardIntoSnapshot(defaultsSnapshot, state);
    onComplete(state.name.trim(), fullInputs, {
      timestamp: new Date().toISOString(),
      source: 'wizard',
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <StepIndicator step={Math.min(state.step, steps - 1)} total={steps} />
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        {kind === 'name' ? (
          <NameStep
            name={state.name}
            onNameChange={(name) => patch({ name })}
            onAdvance={goNext}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
        {kind === 'project' ? <ProjectStep state={state} onChange={patch} /> : null}
        {kind === 'existing' ? <ExistingLineStep state={state} onChange={patch} /> : null}
        {kind === 'route' ? <RouteStep state={state} onChange={patch} /> : null}

        {state.snapshotError ? (
          <p className="text-sm text-destructive" role="alert">
            {state.snapshotError}
          </p>
        ) : null}

        <DialogFooter>
          {state.step > 0 ? (
            <Button type="button" variant="outline" onClick={goBack}>
              ← Back
            </Button>
          ) : null}
          <Button type="button" disabled={!canAdvance} onClick={onLast ? complete : goNext}>
            {onLast ? 'Create Scenario →' : 'Next →'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
