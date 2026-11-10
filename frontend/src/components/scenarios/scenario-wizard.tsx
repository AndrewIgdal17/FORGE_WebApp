import { useEffect, useRef, useState } from 'react';
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
import type { RequiredField, RequiredResponse } from '@/lib/api';
import { requiredInputs } from '@/lib/api';
import {
  buildCategoryKey,
  buildOldCategoryKey,
  getCircuitDetails,
  loadLookups,
  validateCategoryKey,
} from '@/lib/lookups';
import type { ProjectFields } from '@/lib/lookups';
import { setValueAtPath } from '@/lib/path';
import { cn } from '@/lib/utils';
import {
  STEP_ORDER,
  WIZARD_PATH,
  projectTypes,
  stepBlocked,
} from '@/lib/wizard-steps';
import type { ProjectType, StepKind } from '@/lib/wizard-steps';

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

type AcDc = '' | 'AC' | 'DC';
type SendingSource = 'margin' | 'dedicated';

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
  delayYears: number | null;
  constructionYears: number | null;
  projectLifetime: number | null;
  sendingSource: SendingSource;
  flowShare: number | null;
  contractPrice: number | null;
  emissionCo2e: number | null;
  emissionSo2: number | null;
  emissionNox: number | null;
  utilization: number | null;
  exceedance: number | null;
  capacityValue: boolean;
  capacityCredit: number | null;
  capacityPrice: number | null;
  snapshotError: string;
}

const CONSTRUCTION_TYPES = [
  'Overhead',
  'Underground Direct-Buried',
  'Underground Tunnel',
] as const;

const CONVERTER_OPTIONS = ['LCC Converter', 'VSC Converter'] as const;

const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  greenfield: 'Greenfield (new build)',
  reconductoring: 'Reconductoring (existing corridor)',
  rebuild: 'Rebuild',
};

const STEP_COPY: Record<StepKind, { title: string; description: string }> = {
  name: {
    title: 'Name your scenario',
    description:
      'This identifies your scenario in the comparison table and exports. You can rename it later.',
  },
  project: {
    title: 'Define your project',
    description:
      'Choose how the line is built. Voltage and circuits come from the category row.',
  },
  timeline: {
    title: 'Timeline',
    description: 'Delay years, construction years, and project lifetime. Each starts empty.',
  },
  benefits: {
    title: 'Benefits setup',
    description: 'Sending-end source and the benefit inputs the route cannot supply.',
  },
};

const SNAPSHOT_ERROR = 'Reference data is not loaded yet. Please wait a moment and try again.';
const EXCEEDANCE_HINT = 'Empty means equal to the effective capacity';

function createInitialState(): WizardState {
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
    delayYears: null,
    constructionYears: null,
    projectLifetime: null,
    sendingSource: 'margin',
    flowShare: null,
    contractPrice: null,
    emissionCo2e: null,
    emissionSo2: null,
    emissionNox: null,
    utilization: 0.7,
    exceedance: null,
    capacityValue: false,
    capacityCredit: null,
    capacityPrice: null,
    snapshotError: '',
  };
}

function isProjectType(value: string): value is ProjectType {
  return (projectTypes() as string[]).includes(value);
}

function isSendingSource(value: string): value is SendingSource {
  return value === 'margin' || value === 'dedicated';
}

function isAcDc(value: string): value is AcDc {
  return value === 'AC' || value === 'DC';
}

function conductorOptions(constructionType: string): readonly string[] {
  return CONDUCTOR_TYPE_BY_CONSTRUCTION[constructionType] ?? [];
}

function capacityOptions(acDc: AcDc): readonly number[] {
  if (acDc !== 'AC' && acDc !== 'DC') return [];
  return CAPACITY_OPTIONS_BY_AC_DC[acDc];
}

function projectFieldsOf(state: WizardState): ProjectFields {
  const fields: ProjectFields = {
    constructionType: state.constructionType,
    acDc: state.acDc,
    capacityMw: state.capacityMw ?? 0,
    conductorType: state.conductorType,
  };
  if (state.converterType) fields.converterType = state.converterType;
  if (state.oldAcDc) fields.oldAcDc = state.oldAcDc;
  if (state.oldCapacityMw != null) fields.oldCapacityMw = state.oldCapacityMw;
  if (state.oldConductorType) fields.oldConductorType = state.oldConductorType;
  if (state.oldConverterType) fields.oldConverterType = state.oldConverterType;
  return fields;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function formatDerived(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.length > 0) return value;
  return '—';
}

function derivedCircuit(
  defaults: Record<string, unknown> | null,
  state: WizardState,
): { voltage: string; circuits: string } {
  const empty = { voltage: '—', circuits: '—' };
  if (!defaults || state.capacityMw == null) return empty;
  if (!state.constructionType || !state.acDc || !state.conductorType) return empty;
  if (state.acDc === 'DC' && !state.converterType) return empty;
  try {
    const lookups = loadLookups(defaults);
    const key = buildCategoryKey(projectFieldsOf(state));
    if (!key) return empty;
    const row = asRecord(getCircuitDetails(lookups, key));
    if (!row) return empty;
    return {
      voltage: formatDerived(row.voltage_kv),
      circuits: formatDerived(row.number_of_circuits_poles),
    };
  } catch {
    return empty;
  }
}

function dcFieldsValid(state: WizardState): boolean {
  if (state.acDc !== 'DC') return true;
  return (
    state.converterType.length > 0 &&
    state.numberOfConverters != null &&
    state.numberOfConverters >= 1
  );
}

function oldFieldsValid(state: WizardState): boolean {
  if (state.projectType === 'greenfield') return true;
  if (!state.oldAcDc || state.oldCapacityMw == null || !state.oldConductorType) return false;
  if (state.oldAcDc === 'DC' && !state.oldConverterType) return false;
  return true;
}

function categoryProblem(
  state: WizardState,
  defaults: Record<string, unknown> | null,
): string {
  if (
    !state.constructionType ||
    !state.acDc ||
    state.capacityMw == null ||
    !state.conductorType ||
    !dcFieldsValid(state)
  ) {
    return '';
  }
  if (!defaults) return SNAPSHOT_ERROR;
  let lookups;
  try {
    lookups = loadLookups(defaults);
  } catch {
    return SNAPSHOT_ERROR;
  }
  const key = buildCategoryKey(projectFieldsOf(state));
  if (!key) return '';
  const result = validateCategoryKey(key, lookups);
  if (!result.valid) return result.reason ?? 'Configuration not found.';
  if (state.projectType !== 'greenfield' && oldFieldsValid(state)) {
    const oldKey = buildOldCategoryKey(projectFieldsOf(state));
    if (oldKey) {
      const oldResult = validateCategoryKey(oldKey, lookups);
      if (!oldResult.valid) return oldResult.reason ?? 'Configuration not found.';
    }
  }
  return '';
}

function projectStepValid(
  state: WizardState,
  defaults: Record<string, unknown> | null,
): boolean {
  if (
    !state.constructionType ||
    !state.acDc ||
    state.capacityMw == null ||
    !state.conductorType
  ) {
    return false;
  }
  if (!dcFieldsValid(state) || !oldFieldsValid(state)) return false;
  return categoryProblem(state, defaults) === '';
}

function timelineStepValid(state: WizardState): boolean {
  return (
    state.delayYears != null &&
    state.delayYears >= 0 &&
    state.constructionYears != null &&
    state.constructionYears >= 0 &&
    state.projectLifetime != null &&
    state.projectLifetime >= 1
  );
}

function localStepValid(
  kind: StepKind,
  state: WizardState,
  defaults: Record<string, unknown> | null,
): boolean {
  switch (kind) {
    case 'name':
      return state.name.trim().length > 0;
    case 'project':
      return projectStepValid(state, defaults);
    case 'timeline':
      return timelineStepValid(state);
    case 'benefits':
      return true;
  }
}

function wizardChanges(state: WizardState): Record<string, unknown> {
  const changes: Record<string, unknown> = {
    [WIZARD_PATH.projectType]: state.projectType,
    [WIZARD_PATH.capacityMw]: state.capacityMw,
    [WIZARD_PATH.delayYears]: state.delayYears,
    [WIZARD_PATH.constructionYears]: state.constructionYears,
    [WIZARD_PATH.projectLifetime]: state.projectLifetime,
    [WIZARD_PATH.sendingSource]: state.sendingSource,
    [WIZARD_PATH.flowShare]: state.flowShare,
    [WIZARD_PATH.contractPrice]: state.contractPrice,
    [WIZARD_PATH.emissionCo2e]: state.emissionCo2e,
    [WIZARD_PATH.emissionSo2]: state.emissionSo2,
    [WIZARD_PATH.emissionNox]: state.emissionNox,
    [WIZARD_PATH.utilization]: state.utilization ?? 0.7,
    [WIZARD_PATH.capacityGate]: state.capacityValue,
  };
  if (state.acDc === 'AC' || state.acDc === 'DC') {
    changes[WIZARD_PATH.acDc] = state.acDc;
  }
  if (state.projectType !== 'greenfield') {
    changes[WIZARD_PATH.oldCapacityMw] = state.oldCapacityMw;
    changes[WIZARD_PATH.oldAcDc] = state.oldAcDc || null;
    changes[WIZARD_PATH.oldConductorType] = state.oldConductorType || null;
    changes[WIZARD_PATH.oldConverterType] =
      state.oldAcDc === 'DC' ? state.oldConverterType || null : null;
  }
  if (state.exceedance != null) {
    const path =
      state.projectType === 'greenfield'
        ? WIZARD_PATH.greenfieldExceedance
        : WIZARD_PATH.incrementalExceedance;
    changes[path] = state.exceedance;
  }
  if (state.capacityCredit != null) changes[WIZARD_PATH.capacityCredit] = state.capacityCredit;
  if (state.capacityPrice != null) changes[WIZARD_PATH.capacityPrice] = state.capacityPrice;
  return changes;
}

function mergeWizardIntoSnapshot(
  snapshot: Record<string, unknown>,
  state: WizardState,
): Record<string, unknown> {
  const full = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
  setValueAtPath(full, WIZARD_PATH.constructionType, state.constructionType);
  setValueAtPath(full, WIZARD_PATH.acDc, state.acDc);
  setValueAtPath(full, WIZARD_PATH.capacityMw, state.capacityMw);
  setValueAtPath(full, WIZARD_PATH.conductorType, state.conductorType);
  setValueAtPath(
    full,
    WIZARD_PATH.converterType,
    state.acDc === 'AC' ? 'NA' : state.converterType,
  );
  setValueAtPath(
    full,
    WIZARD_PATH.numberOfConverters,
    state.acDc === 'DC' ? (state.numberOfConverters ?? 0) : 0,
  );
  setValueAtPath(full, WIZARD_PATH.projectType, state.projectType);
  setValueAtPath(full, WIZARD_PATH.constructionYears, state.constructionYears);
  setValueAtPath(full, WIZARD_PATH.delayYears, state.delayYears);
  setValueAtPath(full, WIZARD_PATH.projectLifetime, state.projectLifetime);
  setValueAtPath(full, WIZARD_PATH.sendingSource, state.sendingSource);
  setValueAtPath(full, WIZARD_PATH.utilization, state.utilization ?? 0.7);
  setValueAtPath(full, WIZARD_PATH.capacityGate, state.capacityValue);

  if (state.flowShare != null) setValueAtPath(full, WIZARD_PATH.flowShare, state.flowShare);
  if (state.contractPrice != null) {
    setValueAtPath(full, WIZARD_PATH.contractPrice, state.contractPrice);
  }
  if (state.emissionCo2e != null) setValueAtPath(full, WIZARD_PATH.emissionCo2e, state.emissionCo2e);
  if (state.emissionSo2 != null) setValueAtPath(full, WIZARD_PATH.emissionSo2, state.emissionSo2);
  if (state.emissionNox != null) setValueAtPath(full, WIZARD_PATH.emissionNox, state.emissionNox);
  if (state.exceedance != null) {
    const path =
      state.projectType === 'greenfield'
        ? WIZARD_PATH.greenfieldExceedance
        : WIZARD_PATH.incrementalExceedance;
    setValueAtPath(full, path, state.exceedance);
  }
  if (state.capacityCredit != null) {
    setValueAtPath(full, WIZARD_PATH.capacityCredit, state.capacityCredit);
  }
  if (state.capacityPrice != null) {
    setValueAtPath(full, WIZARD_PATH.capacityPrice, state.capacityPrice);
  }

  if (state.projectType !== 'greenfield') {
    setValueAtPath(full, WIZARD_PATH.oldAcDc, state.oldAcDc);
    setValueAtPath(full, WIZARD_PATH.oldCapacityMw, state.oldCapacityMw);
    setValueAtPath(full, WIZARD_PATH.oldConductorType, state.oldConductorType);
    if (state.oldAcDc === 'DC') {
      setValueAtPath(full, WIZARD_PATH.oldConverterType, state.oldConverterType);
    }
  }

  return full;
}

function messageFor(blocked: RequiredField[], path: string): string | undefined {
  return blocked.find((field) => field.path === path)?.message;
}

function placedPaths(kind: StepKind, state: WizardState): Set<string> {
  const placed = new Set<string>();
  if (kind === 'project') {
    placed.add(WIZARD_PATH.capacityMw);
    if (state.projectType !== 'greenfield') {
      placed.add(WIZARD_PATH.oldCapacityMw);
      placed.add(WIZARD_PATH.oldAcDc);
      placed.add(WIZARD_PATH.oldConductorType);
      if (state.oldAcDc === 'DC') placed.add(WIZARD_PATH.oldConverterType);
    }
  }
  if (kind === 'timeline') {
    placed.add(WIZARD_PATH.delayYears);
    placed.add(WIZARD_PATH.constructionYears);
    placed.add(WIZARD_PATH.projectLifetime);
  }
  if (kind === 'benefits') {
    if (state.projectType === 'greenfield' && state.sendingSource === 'margin') {
      placed.add(WIZARD_PATH.flowShare);
    }
    if (state.sendingSource === 'dedicated') {
      placed.add(WIZARD_PATH.contractPrice);
      placed.add(WIZARD_PATH.emissionCo2e);
      placed.add(WIZARD_PATH.emissionSo2);
      placed.add(WIZARD_PATH.emissionNox);
    }
  }
  return placed;
}

function parseOptionalInt(raw: string): number | null {
  if (raw.trim() === '') return null;
  const value = Number.parseInt(raw, 10);
  return Number.isNaN(value) ? null : value;
}

function parseOptionalDecimal(raw: string): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function Field({
  label,
  htmlFor,
  children,
  hint,
  message,
}: {
  label: string;
  htmlFor?: string;
  children: ReactElement | ReactElement[];
  hint?: string;
  message?: string;
}): ReactElement {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {message ? (
        <p className="text-sm text-destructive" role="alert">
          {message}
        </p>
      ) : null}
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
  message,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  disabled?: boolean;
  message?: string;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <Field label={label} htmlFor={id} message={message}>
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

function IntegerField({
  id,
  label,
  value,
  min,
  hint,
  message,
  onChange,
}: {
  id: string;
  label: string;
  value: number | null;
  min?: number;
  hint?: string;
  message?: string;
  onChange: (value: number | null) => void;
}): ReactElement {
  return (
    <Field label={label} htmlFor={id} hint={hint} message={message}>
      <Input
        id={id}
        type="number"
        min={min}
        step={1}
        value={value ?? ''}
        aria-invalid={message ? true : undefined}
        onChange={(event) => onChange(parseOptionalInt(event.target.value))}
      />
    </Field>
  );
}

function DecimalField({
  id,
  label,
  value,
  min,
  max,
  step,
  hint,
  message,
  onChange,
}: {
  id: string;
  label: string;
  value: number | null;
  min?: number;
  max?: number;
  step?: number | 'any';
  hint?: string;
  message?: string;
  onChange: (value: number | null) => void;
}): ReactElement {
  return (
    <Field label={label} htmlFor={id} hint={hint} message={message}>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step ?? 'any'}
        value={value ?? ''}
        aria-invalid={message ? true : undefined}
        onChange={(event) => onChange(parseOptionalDecimal(event.target.value))}
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
  defaults,
  blocked,
  onChange,
}: {
  state: WizardState;
  defaults: Record<string, unknown> | null;
  blocked: RequiredField[];
  onChange: (patch: Partial<WizardState>) => void;
}): ReactElement {
  const capacities = capacityOptions(state.acDc);
  const conductors = conductorOptions(state.constructionType);
  const oldCapacities = capacityOptions(state.oldAcDc);
  const oldConductors = conductorOptions(state.constructionType);
  const derived = derivedCircuit(defaults, state);
  const replaced = state.projectType !== 'greenfield';

  return (
    <div className="grid gap-4">
      <Field label="Project type">
        <RadioGroup
          name="wizard-project-type"
          value={state.projectType}
          options={projectTypes().map((value) => ({
            value,
            label: PROJECT_TYPE_LABELS[value],
          }))}
          onChange={(value) => {
            if (isProjectType(value)) onChange({ projectType: value });
          }}
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
            if (!isAcDc(value) || value === '') return;
            const allowed = capacityOptions(value);
            onChange({
              acDc: value,
              capacityMw:
                state.capacityMw != null && allowed.includes(state.capacityMw)
                  ? state.capacityMw
                  : null,
              converterType: value === 'AC' ? '' : state.converterType,
              numberOfConverters: value === 'AC' ? null : state.numberOfConverters,
            });
          }}
        />
      </Field>
      <OptionSelect
        id="wizard-capacity"
        label="Capacity (MW)"
        value={state.capacityMw == null ? '' : String(state.capacityMw)}
        disabled={capacities.length === 0}
        message={messageFor(blocked, WIZARD_PATH.capacityMw)}
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
          <IntegerField
            id="wizard-converter-count"
            label="Number of converters"
            value={state.numberOfConverters}
            min={1}
            onChange={(numberOfConverters) =>
              onChange({
                numberOfConverters:
                  numberOfConverters != null && numberOfConverters >= 1
                    ? numberOfConverters
                    : null,
              })
            }
          />
        </>
      ) : null}
      <Field
        label="Voltage (kV)"
        htmlFor="wizard-voltage"
        hint="Read-only, from the category row."
      >
        <Input
          id="wizard-voltage"
          value={derived.voltage}
          readOnly
          aria-readonly="true"
          className="bg-muted"
        />
      </Field>
      <Field
        label="Circuits / poles"
        htmlFor="wizard-circuits"
        hint="Read-only, from the category row."
      >
        <Input
          id="wizard-circuits"
          value={derived.circuits}
          readOnly
          aria-readonly="true"
          className="bg-muted"
        />
      </Field>
      {replaced ? (
        <>
          <h3 className="text-sm font-medium">Replaced line</h3>
          <Field label="Old AC / DC" message={messageFor(blocked, WIZARD_PATH.oldAcDc)}>
            <RadioGroup
              name="wizard-old-acdc"
              value={state.oldAcDc}
              options={[
                { value: 'AC', label: 'AC' },
                { value: 'DC', label: 'DC' },
              ]}
              onChange={(value) => {
                if (!isAcDc(value) || value === '') return;
                const allowed = capacityOptions(value);
                onChange({
                  oldAcDc: value,
                  oldCapacityMw:
                    state.oldCapacityMw != null && allowed.includes(state.oldCapacityMw)
                      ? state.oldCapacityMw
                      : null,
                  oldConverterType: value === 'AC' ? '' : state.oldConverterType,
                });
              }}
            />
          </Field>
          <OptionSelect
            id="wizard-old-capacity"
            label="Old capacity (MW)"
            value={state.oldCapacityMw == null ? '' : String(state.oldCapacityMw)}
            disabled={oldCapacities.length === 0}
            message={messageFor(blocked, WIZARD_PATH.oldCapacityMw)}
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
            message={messageFor(blocked, WIZARD_PATH.oldConductorType)}
            options={oldConductors.map((value) => ({ value, label: value }))}
            onChange={(oldConductorType) => onChange({ oldConductorType })}
          />
          {state.oldAcDc === 'DC' ? (
            <Field
              label="Old converter"
              message={messageFor(blocked, WIZARD_PATH.oldConverterType)}
            >
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

function TimelineStep({
  state,
  blocked,
  onChange,
}: {
  state: WizardState;
  blocked: RequiredField[];
  onChange: (patch: Partial<WizardState>) => void;
}): ReactElement {
  return (
    <div className="grid gap-4">
      <IntegerField
        id="wizard-delay-years"
        label="Delay years"
        value={state.delayYears}
        min={0}
        message={messageFor(blocked, WIZARD_PATH.delayYears)}
        onChange={(delayYears) =>
          onChange({ delayYears: delayYears != null ? Math.max(0, delayYears) : null })
        }
      />
      <IntegerField
        id="wizard-construction-years"
        label="Construction years"
        value={state.constructionYears}
        min={0}
        message={messageFor(blocked, WIZARD_PATH.constructionYears)}
        onChange={(constructionYears) =>
          onChange({
            constructionYears: constructionYears != null ? Math.max(0, constructionYears) : null,
          })
        }
      />
      <IntegerField
        id="wizard-lifetime"
        label="Project lifetime"
        value={state.projectLifetime}
        min={1}
        hint="Operating years after commercial operation date."
        message={messageFor(blocked, WIZARD_PATH.projectLifetime)}
        onChange={(projectLifetime) =>
          onChange({
            projectLifetime:
              projectLifetime != null && projectLifetime >= 1 ? projectLifetime : null,
          })
        }
      />
    </div>
  );
}

function UtilizationField({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}): ReactElement {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value == null ? '' : value.toFixed(2));
  const shown = focused ? draft : value == null ? '' : value.toFixed(2);

  return (
    <Field label="Utilization share" htmlFor="wizard-utilization">
      <Input
        id="wizard-utilization"
        type="text"
        inputMode="decimal"
        value={shown}
        onFocus={() => {
          setDraft(value == null ? '' : value.toFixed(2));
          setFocused(true);
        }}
        onBlur={() => {
          setFocused(false);
          if (value == null) onChange(0.7);
        }}
        onChange={(event) => {
          const raw = event.target.value;
          setDraft(raw);
          if (raw.trim() === '') {
            onChange(null);
            return;
          }
          const parsed = Number(raw);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
      />
    </Field>
  );
}

function BenefitsStep({
  state,
  blocked,
  onChange,
}: {
  state: WizardState;
  blocked: RequiredField[];
  onChange: (patch: Partial<WizardState>) => void;
}): ReactElement {
  const showFlow = state.projectType === 'greenfield' && state.sendingSource === 'margin';
  const showDedicated = state.sendingSource === 'dedicated';

  return (
    <div className="grid gap-4">
      <Field label="Sending-end source">
        <RadioGroup
          name="wizard-sending-source"
          value={state.sendingSource}
          options={[
            { value: 'margin', label: 'Regional margin' },
            { value: 'dedicated', label: 'Dedicated' },
          ]}
          onChange={(value) => {
            if (isSendingSource(value)) onChange({ sendingSource: value });
          }}
        />
      </Field>
      {showFlow ? (
        <DecimalField
          id="wizard-flow-share"
          label="Flow share"
          value={state.flowShare}
          min={0}
          max={1}
          message={messageFor(blocked, WIZARD_PATH.flowShare)}
          onChange={(flowShare) => onChange({ flowShare })}
        />
      ) : null}
      {showDedicated ? (
        <>
          <DecimalField
            id="wizard-contract-price"
            label="Contract price ($/MWh)"
            value={state.contractPrice}
            message={messageFor(blocked, WIZARD_PATH.contractPrice)}
            onChange={(contractPrice) => onChange({ contractPrice })}
          />
          <DecimalField
            id="wizard-emission-co2e"
            label="CO2e emission rate (kg/MWh)"
            value={state.emissionCo2e}
            min={0}
            message={messageFor(blocked, WIZARD_PATH.emissionCo2e)}
            onChange={(emissionCo2e) => onChange({ emissionCo2e })}
          />
          <DecimalField
            id="wizard-emission-so2"
            label="SO2 emission rate (kg/MWh)"
            value={state.emissionSo2}
            min={0}
            message={messageFor(blocked, WIZARD_PATH.emissionSo2)}
            onChange={(emissionSo2) => onChange({ emissionSo2 })}
          />
          <DecimalField
            id="wizard-emission-nox"
            label="NOx emission rate (kg/MWh)"
            value={state.emissionNox}
            min={0}
            message={messageFor(blocked, WIZARD_PATH.emissionNox)}
            onChange={(emissionNox) => onChange({ emissionNox })}
          />
        </>
      ) : null}
      <UtilizationField
        value={state.utilization}
        onChange={(utilization) => onChange({ utilization })}
      />
      <DecimalField
        id="wizard-exceedance"
        label="Exceedance (MW)"
        value={state.exceedance}
        min={0}
        hint={EXCEEDANCE_HINT}
        onChange={(exceedance) => onChange({ exceedance })}
      />
      <label className="flex items-center gap-2 text-sm" htmlFor="wizard-capacity-value">
        <input
          id="wizard-capacity-value"
          type="checkbox"
          checked={state.capacityValue}
          onChange={(event) => onChange({ capacityValue: event.target.checked })}
        />
        Capacity value
      </label>
      {state.capacityValue ? (
        <>
          <DecimalField
            id="wizard-capacity-credit"
            label="Capacity credit"
            value={state.capacityCredit}
            min={0}
            onChange={(capacityCredit) => onChange({ capacityCredit })}
          />
          <DecimalField
            id="wizard-capacity-price"
            label="Capacity price ($/MW-year)"
            value={state.capacityPrice}
            min={0}
            onChange={(capacityPrice) => onChange({ capacityPrice })}
          />
        </>
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
  const [state, setState] = useState<WizardState>(() => createInitialState());
  const [seenOpen, setSeenOpen] = useState(open);
  const [required, setRequired] = useState<RequiredResponse | null>(null);
  const [requiredError, setRequiredError] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkedKey, setCheckedKey] = useState<string | null>(null);
  const requestSeq = useRef(0);

  if (open !== seenOpen) {
    setSeenOpen(open);
    if (open) {
      setState(createInitialState());
      setRequired(null);
      setRequiredError('');
      setChecking(false);
      setCheckedKey(null);
    }
  }

  const changeKey = JSON.stringify(wizardChanges(state));

  useEffect(() => {
    if (!open) return;
    const id = ++requestSeq.current;
    const changes = JSON.parse(changeKey) as Record<string, unknown>;
    setChecking(true);
    requiredInputs(changes)
      .then((response) => {
        if (id !== requestSeq.current) return;
        setRequired(response);
        setRequiredError('');
        setCheckedKey(changeKey);
      })
      .catch((error: unknown) => {
        if (id !== requestSeq.current) return;
        setRequired(null);
        setRequiredError(error instanceof Error ? error.message : 'Could not check required inputs.');
      })
      .finally(() => {
        if (id === requestSeq.current) setChecking(false);
      });
  }, [open, changeKey]);

  const stepIndex = Math.min(Math.max(state.step, 0), STEP_ORDER.length - 1);
  const kind = STEP_ORDER[stepIndex];
  const copy = STEP_COPY[kind];
  const onLast = stepIndex === STEP_ORDER.length - 1;
  const responseReady =
    checkedKey === changeKey && !checking && required != null && requiredError === '';
  const blocked = responseReady ? stepBlocked(kind, required) : [];
  const waiting = kind !== 'name' && !responseReady;
  const canAdvance =
    !waiting &&
    blocked.length === 0 &&
    localStepValid(kind, state, defaultsSnapshot);
  const categoryMessage = kind === 'project' ? categoryProblem(state, defaultsSnapshot) : '';
  const placed = placedPaths(kind, state);
  const unplaced = blocked.filter((field) => !placed.has(field.path));

  function patch(next: Partial<WizardState>): void {
    setState((prev) => ({ ...prev, ...next, snapshotError: '' }));
  }

  function goBack(): void {
    setState((prev) => ({ ...prev, step: Math.max(0, prev.step - 1), snapshotError: '' }));
  }

  function goNext(): void {
    if (!localStepValid(kind, state, defaultsSnapshot)) return;
    if (waiting || blocked.length > 0) return;
    setState((prev) => ({
      ...prev,
      step: Math.min(prev.step + 1, STEP_ORDER.length - 1),
    }));
  }

  function complete(): void {
    if (!localStepValid(kind, state, defaultsSnapshot) || waiting || blocked.length > 0) return;
    if (!defaultsSnapshot) {
      setState((prev) => ({ ...prev, snapshotError: SNAPSHOT_ERROR }));
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
          <StepIndicator step={stepIndex} total={STEP_ORDER.length} />
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
        {kind === 'project' ? (
          <ProjectStep
            state={state}
            defaults={defaultsSnapshot}
            blocked={blocked}
            onChange={patch}
          />
        ) : null}
        {kind === 'timeline' ? (
          <TimelineStep state={state} blocked={blocked} onChange={patch} />
        ) : null}
        {kind === 'benefits' ? (
          <BenefitsStep state={state} blocked={blocked} onChange={patch} />
        ) : null}

        {unplaced.map((field) => (
          <p key={field.path} className="text-sm text-destructive" role="alert">
            {field.message}
          </p>
        ))}
        {categoryMessage ? (
          <p className="text-sm text-destructive" role="alert">
            {categoryMessage}
          </p>
        ) : null}
        {state.snapshotError ? (
          <p className="text-sm text-destructive" role="alert">
            {state.snapshotError}
          </p>
        ) : null}
        {requiredError ? (
          <p className="text-sm text-destructive" role="alert">
            {requiredError}
          </p>
        ) : null}

        <DialogFooter>
          {stepIndex > 0 ? (
            <Button type="button" variant="outline" onClick={goBack}>
              ← Back
            </Button>
          ) : null}
          <Button type="button" disabled={!canAdvance} onClick={onLast ? complete : goNext}>
            {onLast ? 'Draw Route →' : 'Next →'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
