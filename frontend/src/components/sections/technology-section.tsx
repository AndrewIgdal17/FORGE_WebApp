import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { CheckboxField } from '@/components/form/checkbox-field';
import { CurrencyField } from '@/components/form/currency-field';
import { NumberField } from '@/components/form/number-field';
import { PercentageField } from '@/components/form/percentage-field';
import { SelectField } from '@/components/form/select-field';
import type { SelectOption } from '@/components/form/select-field';
import {
  CAPACITY_OPTIONS_BY_AC_DC,
  CONDUCTOR_TYPE_BY_CONSTRUCTION,
} from '@/data/configs';
import {
  CONVERTER_OPTIONS,
  capacityOptions,
  conductorOptions,
  isAcDc,
} from '@/data/technology-options';
import { useFormStore } from '@/stores/form-store';

const PROJECT = '01_project_technical_details.project';

const CONSTRUCTION_TYPE_PATH = `${PROJECT}.construction_type`;
const AC_DC_PATH = `${PROJECT}.ac_dc`;
const CAPACITY_PATH = `${PROJECT}.capacity_mw`;
const CONDUCTOR_PATH = `${PROJECT}.conductor_type`;
const UTILIZATION_PATH = `${PROJECT}.line_utilization`;
const VALUE_OF_LOAD_PATH = `${PROJECT}.value_of_load_per_mwh`;
const CONVERTER_COUNT_PATH = `${PROJECT}.number_of_converters`;
const CONVERTER_TYPE_PATH = `${PROJECT}.converter_type`;
const PROJECT_TYPE_PATH = `${PROJECT}.project_type`;
const COMPARISON_CAPACITY_PATH = `${PROJECT}.greenfield_comparison_capacity_mw`;
const COMPARISON_CONDUCTOR_PATH = `${PROJECT}.greenfield_comparison_conductor_type`;
const USES_EXISTING_ROW_PATH = `${PROJECT}.uses_existing_row`;
const OLD_AC_DC_PATH = `${PROJECT}.old_ac_dc`;
const OLD_CAPACITY_PATH = `${PROJECT}.old_capacity_mw`;
const OLD_CONDUCTOR_PATH = `${PROJECT}.old_conductor_type`;
const OLD_CONVERTER_TYPE_PATH = `${PROJECT}.old_converter_type`;

const CONSTRUCTION_OPTIONS: SelectOption[] = [
  { value: 'Overhead', label: 'Overhead' },
  { value: 'Underground Direct-Buried', label: 'Underground Direct-Buried' },
  { value: 'Underground Tunnel', label: 'Underground Tunnel' },
  { value: 'Subsea', label: 'Subsea' },
];

const AC_DC_OPTIONS: SelectOption[] = [
  { value: 'AC', label: 'AC' },
  { value: 'DC', label: 'DC' },
];

const PROJECT_TYPE_OPTIONS: SelectOption[] = [
  { value: 'greenfield', label: 'Greenfield' },
  { value: 'reconductoring', label: 'Reconductoring' },
  { value: 'rebuild', label: 'Rebuild' },
];

function readCapacity(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Capacity selects store option strings. The calculator and category key
 * expect an integer MW, so a chosen string is written back as a number.
 * A capacity outside the active AC/DC list is cleared.
 */
function syncCapacity(
  acDc: unknown,
  capacity: unknown,
  path: string,
  setFieldValue: (path: string, value: unknown) => void,
): void {
  if (!isAcDc(acDc)) return;
  const allowed = CAPACITY_OPTIONS_BY_AC_DC[acDc];
  const numeric = readCapacity(capacity);
  if (numeric === null || numeric === 0) return;
  if (!allowed.includes(numeric)) {
    setFieldValue(path, null);
    return;
  }
  if (typeof capacity === 'string') setFieldValue(path, numeric);
}

function syncConductor(
  constructionType: unknown,
  conductor: unknown,
  path: string,
  setFieldValue: (path: string, value: unknown) => void,
): void {
  if (typeof constructionType !== 'string' || constructionType === '') return;
  if (typeof conductor !== 'string' || conductor === '') return;
  const allowed = CONDUCTOR_TYPE_BY_CONSTRUCTION[constructionType] ?? [];
  if (!allowed.includes(conductor)) setFieldValue(path, null);
}

export function TechnologySection(): ReactElement {
  const constructionType = useFormStore((state) =>
    state.getFieldValue(CONSTRUCTION_TYPE_PATH),
  );
  const acDc = useFormStore((state) => state.getFieldValue(AC_DC_PATH));
  const capacity = useFormStore((state) => state.getFieldValue(CAPACITY_PATH));
  const conductor = useFormStore((state) => state.getFieldValue(CONDUCTOR_PATH));
  const projectType = useFormStore((state) => state.getFieldValue(PROJECT_TYPE_PATH));
  const comparisonCapacity = useFormStore((state) =>
    state.getFieldValue(COMPARISON_CAPACITY_PATH),
  );
  const comparisonConductor = useFormStore((state) =>
    state.getFieldValue(COMPARISON_CONDUCTOR_PATH),
  );
  const oldAcDc = useFormStore((state) => state.getFieldValue(OLD_AC_DC_PATH));
  const oldCapacity = useFormStore((state) => state.getFieldValue(OLD_CAPACITY_PATH));
  const oldConductor = useFormStore((state) =>
    state.getFieldValue(OLD_CONDUCTOR_PATH),
  );
  const setFieldValue = useFormStore((state) => state.setFieldValue);

  const isDc = acDc === 'DC';
  const isGreenfield = projectType === 'greenfield';
  const isReconductoring = projectType === 'reconductoring';
  const showExistingRow =
    projectType === 'reconductoring' || projectType === 'rebuild';

  useEffect(() => {
    syncCapacity(acDc, capacity, CAPACITY_PATH, setFieldValue);
  }, [acDc, capacity, setFieldValue]);

  useEffect(() => {
    syncConductor(constructionType, conductor, CONDUCTOR_PATH, setFieldValue);
  }, [constructionType, conductor, setFieldValue]);

  useEffect(() => {
    if (!isGreenfield) return;
    syncCapacity(acDc, comparisonCapacity, COMPARISON_CAPACITY_PATH, setFieldValue);
  }, [isGreenfield, acDc, comparisonCapacity, setFieldValue]);

  useEffect(() => {
    if (!isGreenfield) return;
    syncConductor(
      constructionType,
      comparisonConductor,
      COMPARISON_CONDUCTOR_PATH,
      setFieldValue,
    );
  }, [isGreenfield, constructionType, comparisonConductor, setFieldValue]);

  useEffect(() => {
    if (!isReconductoring) return;
    syncCapacity(oldAcDc, oldCapacity, OLD_CAPACITY_PATH, setFieldValue);
  }, [isReconductoring, oldAcDc, oldCapacity, setFieldValue]);

  useEffect(() => {
    if (!isReconductoring) return;
    syncConductor(constructionType, oldConductor, OLD_CONDUCTOR_PATH, setFieldValue);
  }, [isReconductoring, constructionType, oldConductor, setFieldValue]);

  return (
    <section id="technology" className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <SelectField
        path={CONSTRUCTION_TYPE_PATH}
        label="Construction type"
        helpText="Overhead, underground, or subsea transmission."
        options={CONSTRUCTION_OPTIONS}
      />
      <SelectField
        path={AC_DC_PATH}
        label="AC / DC"
        helpText="Alternating current or direct current transmission."
        options={AC_DC_OPTIONS}
      />
      <SelectField
        path={CAPACITY_PATH}
        label="Capacity (MW)"
        helpText="Nameplate transfer capacity. Options follow AC / DC."
        options={capacityOptions(acDc)}
      />
      <SelectField
        path={CONDUCTOR_PATH}
        label="Conductor type"
        helpText="Options follow the construction type."
        options={conductorOptions(constructionType)}
      />
      <PercentageField
        path={UTILIZATION_PATH}
        label="Line utilization (%)"
        helpText="Percent of nameplate capacity used on average."
      />
      <CurrencyField
        path={VALUE_OF_LOAD_PATH}
        label="Value of load ($/MWh)"
        helpText="Demand-side marginal value of delivered energy."
      />
      {isDc ? (
        <>
          <NumberField
            path={CONVERTER_COUNT_PATH}
            label="Number of converters"
            helpText="Number of converter stations."
            min={0}
            step={1}
          />
          <SelectField
            path={CONVERTER_TYPE_PATH}
            label="Converter type"
            helpText="LCC or VSC converter station type."
            options={CONVERTER_OPTIONS}
          />
        </>
      ) : null}
      <SelectField
        path={PROJECT_TYPE_PATH}
        label="Project type"
        helpText="Greenfield is a new line. Reconductoring replaces the conductor. Rebuild replaces the structures."
        options={PROJECT_TYPE_OPTIONS}
      />
      {isGreenfield ? (
        <>
          <SelectField
            path={COMPARISON_CAPACITY_PATH}
            label="Comparison capacity (MW)"
            helpText="Optional greenfield capacity for the line-loss comparison case. Blank skips the comparison."
            options={capacityOptions(acDc)}
          />
          <SelectField
            path={COMPARISON_CONDUCTOR_PATH}
            label="Comparison conductor type"
            helpText="Conductor on the optional greenfield comparison case. Blank skips the comparison."
            options={conductorOptions(constructionType)}
          />
        </>
      ) : null}
      {showExistingRow ? (
        <CheckboxField
          path={USES_EXISTING_ROW_PATH}
          label="Uses existing ROW"
          helpText="The project uses an existing right of way."
        />
      ) : null}
      {isReconductoring ? (
        <>
          <h3 className="text-sm font-medium text-slate-900 sm:col-span-2">
            Existing line
          </h3>
          <SelectField
            path={OLD_AC_DC_PATH}
            label="Old AC / DC"
            helpText="AC / DC type of the line being replaced."
            options={AC_DC_OPTIONS}
          />
          <SelectField
            path={OLD_CAPACITY_PATH}
            label="Old capacity (MW)"
            helpText="Capacity of the existing line. Options follow old AC / DC."
            options={capacityOptions(oldAcDc)}
          />
          <SelectField
            path={OLD_CONDUCTOR_PATH}
            label="Old conductor type"
            helpText="Conductor on the existing line. Options follow the construction type."
            options={conductorOptions(constructionType)}
          />
          {oldAcDc === 'DC' ? (
            <SelectField
              path={OLD_CONVERTER_TYPE_PATH}
              label="Old converter type"
              helpText="Converter type on the existing DC line."
              options={CONVERTER_OPTIONS}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
