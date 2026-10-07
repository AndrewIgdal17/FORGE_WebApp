import type { ReactElement } from 'react';
import { SelectField } from '@/components/form/select-field';
import { conductorOptions } from '@/data/technology-options';
import { buildCategoryKey, buildOldCategoryKey, getCircuitDetails } from '@/lib/lookups';
import type { ProjectFields } from '@/lib/lookups';
import { useFormStore } from '@/stores/form-store';

const PROJECT = '01_project_technical_details.project';
const CONDUCTOR_PATH = `${PROJECT}.conductor_type`;

const EMPTY_MESSAGE =
  'Select a valid project configuration to see conductor details.';

interface SpecRow {
  label: string;
  value: string;
  oldValue?: string;
}

const CIRCUIT_ROWS: Array<{
  key: string;
  label: string;
  suffix?: string;
}> = [
  { key: 'conductor_specification', label: 'Conductor specification' },
  { key: 'voltage_kv', label: 'Voltage', suffix: ' kV' },
  { key: 'conductors_per_phase', label: 'Conductors per phase' },
  { key: 'number_of_phases', label: 'Number of phases' },
  { key: 'number_of_circuits_poles', label: 'Circuits / poles' },
  { key: 'AC_75_resistance', label: 'AC resistance (75°C)', suffix: ' Ω/mi' },
  { key: 'DC_20_resistance', label: 'DC resistance (20°C)', suffix: ' Ω/mi' },
  { key: 'material', label: 'Material' },
];

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readCapacity(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function formatSpec(value: unknown, suffix = ''): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value.toLocaleString('en-US', { maximumFractionDigits: 6 })}${suffix}`;
  }
  return `${String(value)}${suffix}`;
}

function projectFields(values: {
  constructionType: unknown;
  acDc: unknown;
  capacityMw: unknown;
  conductorType: unknown;
  converterType: unknown;
  oldAcDc: unknown;
  oldCapacityMw: unknown;
  oldConductorType: unknown;
  oldConverterType: unknown;
}): ProjectFields {
  const fields: ProjectFields = {
    constructionType: readString(values.constructionType),
    acDc: readString(values.acDc),
    capacityMw: readCapacity(values.capacityMw),
    conductorType: readString(values.conductorType),
  };
  const converterType = readString(values.converterType);
  if (converterType) fields.converterType = converterType;
  const oldAcDc = readString(values.oldAcDc);
  if (oldAcDc) fields.oldAcDc = oldAcDc;
  const oldCapacityMw = readCapacity(values.oldCapacityMw);
  if (oldCapacityMw) fields.oldCapacityMw = oldCapacityMw;
  const oldConductorType = readString(values.oldConductorType);
  if (oldConductorType) fields.oldConductorType = oldConductorType;
  const oldConverterType = readString(values.oldConverterType);
  if (oldConverterType) fields.oldConverterType = oldConverterType;
  return fields;
}

function SpecTable({ rows, showOld }: { rows: SpecRow[]; showOld: boolean }): ReactElement {
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3 border-b px-4 py-2 text-xs font-medium text-slate-500">
        <span>Specification</span>
        <span className={showOld ? 'grid grid-cols-2 gap-3' : undefined}>
          {showOld ? (
            <>
              <span>New</span>
              <span>Existing</span>
            </>
          ) : (
            'Value'
          )}
        </span>
      </div>
      <dl>
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3 border-b px-4 py-2 text-sm last:border-b-0"
          >
            <dt className="text-slate-600">{row.label}</dt>
            <dd className={showOld ? 'grid grid-cols-2 gap-3' : undefined}>
              {showOld ? (
                <>
                  <span className="font-medium text-slate-900">{row.value}</span>
                  <span className="font-medium text-slate-900">{row.oldValue}</span>
                </>
              ) : (
                <span className="font-medium text-slate-900">{row.value}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ConductorDetails(): ReactElement {
  const lookups = useFormStore((state) => state.lookups);
  const projectType = useFormStore((state) =>
    state.getFieldValue(`${PROJECT}.project_type`),
  );
  const constructionType = useFormStore((state) =>
    state.getFieldValue(`${PROJECT}.construction_type`),
  );
  const acDc = useFormStore((state) => state.getFieldValue(`${PROJECT}.ac_dc`));
  const capacityMw = useFormStore((state) =>
    state.getFieldValue(`${PROJECT}.capacity_mw`),
  );
  const conductorType = useFormStore((state) =>
    state.getFieldValue(`${PROJECT}.conductor_type`),
  );
  const converterType = useFormStore((state) =>
    state.getFieldValue(`${PROJECT}.converter_type`),
  );
  const oldAcDc = useFormStore((state) => state.getFieldValue(`${PROJECT}.old_ac_dc`));
  const oldCapacityMw = useFormStore((state) =>
    state.getFieldValue(`${PROJECT}.old_capacity_mw`),
  );
  const oldConductorType = useFormStore((state) =>
    state.getFieldValue(`${PROJECT}.old_conductor_type`),
  );
  const oldConverterType = useFormStore((state) =>
    state.getFieldValue(`${PROJECT}.old_converter_type`),
  );
  const showOld = projectType === 'reconductoring';
  const fields = projectFields({
    constructionType,
    acDc,
    capacityMw,
    conductorType,
    converterType,
    oldAcDc,
    oldCapacityMw,
    oldConductorType,
    oldConverterType,
  });
  const categoryKey = buildCategoryKey(fields);
  const entry =
    lookups && categoryKey ? asRecord(getCircuitDetails(lookups, categoryKey)) : null;
  const oldKey = showOld && entry ? buildOldCategoryKey(fields) : null;
  const oldEntry =
    showOld && entry && lookups && oldKey
      ? asRecord(getCircuitDetails(lookups, oldKey))
      : null;
  const rows: SpecRow[] = entry
    ? CIRCUIT_ROWS.map((row) => ({
        label: row.label,
        value: formatSpec(entry[row.key], row.suffix),
        oldValue: showOld ? formatSpec(oldEntry?.[row.key], row.suffix) : undefined,
      }))
    : [];

  return (
    <section id="conductor-details" className="grid max-w-3xl gap-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          path={CONDUCTOR_PATH}
          label="Conductor type"
          helpText="Options follow the construction type."
          options={conductorOptions(constructionType)}
        />
      </div>
      {!entry ? (
        <p className="text-sm text-slate-600">{EMPTY_MESSAGE}</p>
      ) : (
        <>
          {categoryKey ? (
            <p className="text-sm text-slate-600">
              Configuration <span className="font-medium text-slate-900">{categoryKey}</span>
            </p>
          ) : null}
          <SpecTable rows={rows} showOld={showOld} />
        </>
      )}
    </section>
  );
}
