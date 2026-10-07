import type { ReactElement } from 'react';
import { getConverterDetails } from '@/lib/lookups';
import { useFormStore } from '@/stores/form-store';

const PROJECT = '01_project_technical_details.project';

const AC_MESSAGE = 'Converter details apply to DC projects.';
const EMPTY_MESSAGE =
  'Select a valid project configuration to see converter details.';

interface SpecRow {
  label: string;
  value: string;
  oldValue?: string;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readCount(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim() !== '') return value;
  return '—';
}

/** LCC and VSC station losses are fixed physical constants. */
function converterLoss(converterType: string): string {
  if (converterType === 'LCC Converter') return '0.75%';
  if (converterType === 'VSC Converter') return '1.0%';
  return '—';
}

function omRateLabel(entry: unknown): string | null {
  if (typeof entry === 'number' && Number.isFinite(entry)) {
    return `${(entry * 100).toFixed(2)}%`;
  }
  if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
    const rate = (entry as Record<string, unknown>).converter_om_rate;
    if (typeof rate === 'number' && Number.isFinite(rate)) {
      return `${(rate * 100).toFixed(2)}%`;
    }
  }
  return null;
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

export function ConverterDetails(): ReactElement {
  const lookups = useFormStore((state) => state.lookups);
  const acDc = useFormStore((state) => state.getFieldValue(`${PROJECT}.ac_dc`));
  const projectType = useFormStore((state) =>
    state.getFieldValue(`${PROJECT}.project_type`),
  );
  const converterType = useFormStore((state) =>
    state.getFieldValue(`${PROJECT}.converter_type`),
  );
  const converterCount = useFormStore((state) =>
    state.getFieldValue(`${PROJECT}.number_of_converters`),
  );
  const oldAcDc = useFormStore((state) => state.getFieldValue(`${PROJECT}.old_ac_dc`));
  const oldConverterType = useFormStore((state) =>
    state.getFieldValue(`${PROJECT}.old_converter_type`),
  );

  if (acDc !== 'DC') {
    return (
      <section id="converter-details">
        <p className="text-sm text-slate-600">{AC_MESSAGE}</p>
      </section>
    );
  }

  const typeName = readString(converterType);
  const entry = lookups && typeName ? getConverterDetails(lookups, typeName) : null;
  const omRate = omRateLabel(entry);
  if (!omRate) {
    return (
      <section id="converter-details">
        <p className="text-sm text-slate-600">{EMPTY_MESSAGE}</p>
      </section>
    );
  }

  const showOld = projectType === 'reconductoring' && oldAcDc === 'DC';
  const oldTypeName = readString(oldConverterType);
  const oldEntry =
    showOld && lookups && oldTypeName
      ? getConverterDetails(lookups, oldTypeName)
      : null;
  const oldOm = showOld ? (omRateLabel(oldEntry) ?? '—') : undefined;

  const rows: SpecRow[] = [
    {
      label: 'Converter type',
      value: typeName,
      oldValue: showOld ? oldTypeName || '—' : undefined,
    },
    {
      label: 'Number of converters',
      value: readCount(converterCount),
      oldValue: showOld ? readCount(converterCount) : undefined,
    },
    {
      label: 'Converter loss',
      value: converterLoss(typeName),
      oldValue: showOld ? converterLoss(oldTypeName) : undefined,
    },
    {
      label: 'O&M rate (% of CAPEX/yr)',
      value: omRate,
      oldValue: oldOm,
    },
  ];

  return (
    <section id="converter-details" className="grid max-w-3xl gap-3">
      <p className="text-sm text-slate-600">
        Configuration{' '}
        <span className="font-medium text-slate-900">{typeName}</span>
      </p>
      <SpecTable rows={rows} showOld={showOld} />
    </section>
  );
}
