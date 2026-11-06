import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { CurrencyField } from '@/components/form/currency-field';
import { NumberField } from '@/components/form/number-field';
import { PercentageField } from '@/components/form/percentage-field';
import { SelectField } from '@/components/form/select-field';
import type { SelectOption } from '@/components/form/select-field';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { terrainMilesPath, terrainsForConstruction } from '@/components/sections/terrain-mix';
import type { TerrainId } from '@/components/sections/terrain-mix';
import { terrainMatchesRouteLength } from '@/lib/analyze-request';
import { milesToAcres } from '@/lib/geometry';
import { buildCategoryKey, getRowWidthFeet } from '@/lib/lookups';
import type { ProjectFields } from '@/lib/lookups';
import { getValueAtPath } from '@/lib/path';
import { useFormStore } from '@/stores/form-store';

const PROJECT = '01_project_technical_details.project';
const CONSTRUCTION_TYPE_PATH = `${PROJECT}.construction_type`;
const USES_EXISTING_ROW_PATH = `${PROJECT}.uses_existing_row`;
const ROW_AGREEMENT_PATH = `${PROJECT}.row_agreement_type`;
const ROW_AGREEMENT_OPTIONS: SelectOption[] = [
  { value: 'permanent_easement_new', label: 'Permanent easement' },
  { value: 'fee_simple', label: 'Fee simple' },
  { value: 'federal_hybrid', label: 'Federal hybrid' },
  { value: 'lease_license_existing', label: 'Lease or license (existing)' },
];
const ROW_AGREEMENT_HELP =
  'Lease drops acquisition and holding, keeps rent from year 1. Permanent easement and fee simple keep acquisition and holding, drop rent. Federal hybrid keeps all three. If unset, reconductoring/rebuild/existing-ROW infers lease; otherwise permanent easement.';
const ROW_ROOT = '11_project_row_details.right_of_way';
const ROW_RENT_ESCALATION_PATH = '11_project_row_details.row_rent_escalation_real';
const MAX_ZONES = 15;
const MIN_VISIBLE_ZONES = 3;
const MILES_TOLERANCE = 0.5;
const ZONE_FIELDS = ['miles', 'acquisition_cost', 'rent_cost', 'hold_cost'] as const;

const cellFieldClass = '[&_label]:sr-only';

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/[$,]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatMiles(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function zonePath(zone: number, field: string): string {
  return `${ROW_ROOT}.zone_${zone}.${field}`;
}

function zoneHasData(data: Record<string, unknown> | null, zone: number): boolean {
  if (!data) return false;
  return ZONE_FIELDS.some((field) => {
    const value = getValueAtPath(data, zonePath(zone, field));
    if (value === null || value === undefined || value === '') return false;
    const parsed = readNumber(value);
    return parsed !== 0;
  });
}

function initialVisibleZones(data: Record<string, unknown> | null): number[] {
  let maxZone = 0;
  for (let zone = 1; zone <= MAX_ZONES; zone += 1) {
    if (zoneHasData(data, zone)) maxZone = zone;
  }
  const count = Math.min(MAX_ZONES, Math.max(maxZone, MIN_VISIBLE_ZONES));
  return Array.from({ length: count }, (_, index) => index + 1);
}

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

interface ZoneRowProps {
  zone: number;
  rowWidthFeet: number | null;
  showAcquisition: boolean;
  canRemove: boolean;
  milesReadOnly?: boolean;
  onRemove: (zone: number) => void;
}

function ZoneRow({
  zone,
  rowWidthFeet,
  showAcquisition,
  canRemove,
  milesReadOnly = false,
  onRemove,
}: ZoneRowProps): ReactElement {
  const milesPath = zonePath(zone, 'miles');
  const miles = useFormStore((state) => readNumber(state.getFieldValue(milesPath)));
  const acres =
    miles > 0 && rowWidthFeet != null ? milesToAcres(miles, rowWidthFeet) : 0;
  const acresLabel =
    rowWidthFeet == null ? '—' : acres > 0 ? acres.toFixed(1) : '';

  return (
    <tr className="border-b last:border-b-0">
      <th scope="row" className="px-3 py-2 text-left text-sm font-medium text-slate-800">
        {zone}
      </th>
      <td className={`px-2 py-1.5 ${cellFieldClass}`}>
        <NumberField
          path={milesPath}
          label={`Zone ${zone} miles`}
          min={0}
          readOnly={milesReadOnly}
        />
      </td>
      <td className="px-3 py-2 text-right text-sm tabular-nums text-slate-700">{acresLabel}</td>
      <td className={`px-2 py-1.5 ${cellFieldClass}`}>
        <CurrencyField
          path={zonePath(zone, 'hold_cost')}
          label={`Zone ${zone} holding cost per acre-year`}
        />
      </td>
      {showAcquisition ? (
        <td className={`px-2 py-1.5 ${cellFieldClass}`}>
          <CurrencyField
            path={zonePath(zone, 'acquisition_cost')}
            label={`Zone ${zone} acquisition cost per acre`}
          />
        </td>
      ) : null}
      <td className={`px-2 py-1.5 ${cellFieldClass}`}>
        <CurrencyField
          path={zonePath(zone, 'rent_cost')}
          label={`Zone ${zone} rent per acre-year`}
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={!canRemove}
          onClick={() => onRemove(zone)}
        >
          Remove
        </Button>
      </td>
    </tr>
  );
}

export function RightsOfWay({
  milesFromRoute = false,
}: {
  milesFromRoute?: boolean;
}): ReactElement {
  const data = useFormStore((state) => state.data);
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const lookups = useFormStore((state) => state.lookups);
  const reconductoring = useFormStore((state) => state.isReconductoring());
  const usesExistingRow = useFormStore(
    (state) => state.getFieldValue(USES_EXISTING_ROW_PATH) === true,
  );
  const showAcquisition = !reconductoring && !usesExistingRow;

  const categoryKey = useFormStore((state) => {
    const fields: ProjectFields = {
      constructionType: readString(state.getFieldValue(`${PROJECT}.construction_type`)),
      acDc: readString(state.getFieldValue(`${PROJECT}.ac_dc`)),
      capacityMw: readCapacity(state.getFieldValue(`${PROJECT}.capacity_mw`)),
      conductorType: readString(state.getFieldValue(`${PROJECT}.conductor_type`)),
    };
    const converterType = readString(state.getFieldValue(`${PROJECT}.converter_type`));
    if (converterType) fields.converterType = converterType;
    return buildCategoryKey(fields);
  });
  const rowWidthFeet =
    lookups && categoryKey ? getRowWidthFeet(lookups, categoryKey) : null;

  const [visibleZones, setVisibleZones] = useState<number[]>(() =>
    initialVisibleZones(data),
  );
  const initialized = useRef(data !== null);

  useEffect(() => {
    if (initialized.current || data === null) return;
    initialized.current = true;
    setVisibleZones(initialVisibleZones(data));
  }, [data]);

  const terrainMilesTotal = useFormStore((state) => {
    const constructionType = state.getFieldValue(CONSTRUCTION_TYPE_PATH);
    const terrains: TerrainId[] = terrainsForConstruction(constructionType);
    return terrains.reduce(
      (sum, terrain) => sum + readNumber(state.getFieldValue(terrainMilesPath(terrain))),
      0,
    );
  });
  const rowMilesTotal = useFormStore((state) =>
    visibleZones.reduce(
      (sum, zone) => sum + readNumber(state.getFieldValue(zonePath(zone, 'miles'))),
      0,
    ),
  );
  const acresTotal = useFormStore((state) => {
    if (rowWidthFeet == null) return null;
    return visibleZones.reduce((sum, zone) => {
      const miles = readNumber(state.getFieldValue(zonePath(zone, 'miles')));
      return sum + (miles > 0 ? milesToAcres(miles, rowWidthFeet) : 0);
    }, 0);
  });
  const mismatch = milesFromRoute
    ? !terrainMatchesRouteLength(terrainMilesTotal, rowMilesTotal)
    : Math.abs(terrainMilesTotal - rowMilesTotal) > MILES_TOLERANCE;

  function addZone(): void {
    setVisibleZones((current) => {
      if (current.length >= MAX_ZONES) return current;
      const next = Array.from({ length: MAX_ZONES }, (_, index) => index + 1).find(
        (zone) => !current.includes(zone),
      );
      if (next === undefined) return current;
      return [...current, next].sort((a, b) => a - b);
    });
  }

  function removeZone(zone: number): void {
    if (visibleZones.length <= 1 || !visibleZones.includes(zone)) return;
    setVisibleZones((current) => current.filter((item) => item !== zone));
    for (const field of ZONE_FIELDS) {
      setFieldValue(zonePath(zone, field), 0);
    }
  }

  return (
    <section id="rights-of-way" className="grid max-w-5xl gap-3">
      <div className="max-w-xl">
        <SelectField
          path={ROW_AGREEMENT_PATH}
          label="ROW agreement"
          helpText={ROW_AGREEMENT_HELP}
          options={ROW_AGREEMENT_OPTIONS}
        />
      </div>
      <div>
        <h2 className="text-base font-semibold text-slate-900">Right-of-way zones</h2>
        <p className="text-sm text-slate-600">
          Per-zone land costs. Zone miles should sum to terrain miles.
        </p>
      </div>
      <div className="max-w-xl">
        <PercentageField
          path={ROW_RENT_ESCALATION_PATH}
          label="ROW rent escalation (%/yr, real)"
          helpText="Real growth of ROW rent. Holding stays flat. Default 0%/yr."
        />
      </div>
      {mismatch ? (
        <Alert className="border-amber-300 bg-amber-50 text-amber-950">
          <AlertTitle>Miles mismatch</AlertTitle>
          <AlertDescription className="text-amber-900">
            Terrain miles ({formatMiles(terrainMilesTotal)}) and right-of-way miles (
            {formatMiles(rowMilesTotal)}) differ. Zone miles must sum to terrain miles.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full min-w-[44rem] border-collapse">
          <caption className="sr-only">Right-of-way zones</caption>
          <thead>
            <tr className="border-b-2 border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-3 py-2">Zone</th>
              <th className="px-3 py-2">Miles</th>
              <th className="px-3 py-2 text-right">Acres</th>
              <th className="px-3 py-2">Holding ($/ac/yr)</th>
              {showAcquisition ? <th className="px-3 py-2">Acquisition ($/acre)</th> : null}
              <th className="px-3 py-2">Rent ($/ac/yr)</th>
              <th className="px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleZones.map((zone) => (
              <ZoneRow
                key={zone}
                zone={zone}
                rowWidthFeet={rowWidthFeet}
                showAcquisition={showAcquisition}
                canRemove={visibleZones.length > 1}
                milesReadOnly={milesFromRoute}
                onRemove={removeZone}
              />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-100 text-sm font-bold text-slate-900">
              <th scope="row" className="px-3 py-2 text-left">
                Total
              </th>
              <td className="px-3 py-2 tabular-nums">{formatMiles(rowMilesTotal)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {acresTotal == null ? '—' : acresTotal > 0 ? acresTotal.toFixed(1) : ''}
              </td>
              <td />
              {showAcquisition ? <td /> : null}
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={visibleZones.length >= MAX_ZONES}
          onClick={addZone}
        >
          + Add Zone
        </Button>
      </div>
    </section>
  );
}
