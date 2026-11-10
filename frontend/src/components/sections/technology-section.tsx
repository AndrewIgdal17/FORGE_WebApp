import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { CurrencyField } from '@/components/form/currency-field';
import { NumberField } from '@/components/form/number-field';
import { PercentageField } from '@/components/form/percentage-field';
import { SelectField } from '@/components/form/select-field';
import type { SelectOption } from '@/components/form/select-field';
import { Input } from '@/components/ui/input';
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
const SENDING_SOURCE_PATH = `${PROJECT}.sending_source`;
const CONTRACT_PRICE_PATH = `${PROJECT}.dedicated_resource.contract_price_per_mwh`;
const EMISSION_CO2E_PATH = `${PROJECT}.dedicated_resource.emission_rate_kg_per_mwh.co2e`;
const EMISSION_SO2_PATH = `${PROJECT}.dedicated_resource.emission_rate_kg_per_mwh.so2`;
const EMISSION_NOX_PATH = `${PROJECT}.dedicated_resource.emission_rate_kg_per_mwh.nox`;
const CONVERTER_COUNT_PATH = `${PROJECT}.number_of_converters`;
const CONVERTER_TYPE_PATH = `${PROJECT}.converter_type`;
const PROJECT_TYPE_PATH = `${PROJECT}.project_type`;
const OLD_AC_DC_PATH = `${PROJECT}.old_ac_dc`;
const OLD_CAPACITY_PATH = `${PROJECT}.old_capacity_mw`;
const OLD_CONDUCTOR_PATH = `${PROJECT}.old_conductor_type`;
const OLD_CONVERTER_TYPE_PATH = `${PROJECT}.old_converter_type`;
const CORONA = '22_corona_losses.corona.voltage_class_tiers';
const CORONA_HELP = 'Annual-average corona loss added to I²R losses.';
const CORONA_TIER_COUNT = 4;

const cellFieldClass = 'px-2 py-1.5 [&_label]:sr-only';

const CONSTRUCTION_OPTIONS: SelectOption[] = [
  { value: 'Overhead', label: 'Overhead' },
  { value: 'Underground Direct-Buried', label: 'Underground Direct-Buried' },
  { value: 'Underground Tunnel', label: 'Underground Tunnel' },
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

const SENDING_SOURCE_OPTIONS: SelectOption[] = [
  { value: 'margin', label: 'Regional margin' },
  { value: 'dedicated', label: 'Dedicated' },
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
  const sendingSource = useFormStore((state) => state.getFieldValue(SENDING_SOURCE_PATH));
  const oldAcDc = useFormStore((state) => state.getFieldValue(OLD_AC_DC_PATH));
  const oldCapacity = useFormStore((state) => state.getFieldValue(OLD_CAPACITY_PATH));
  const oldConductor = useFormStore((state) =>
    state.getFieldValue(OLD_CONDUCTOR_PATH),
  );
  const setFieldValue = useFormStore((state) => state.setFieldValue);

  const isDc = acDc === 'DC';
  const showCorona = constructionType === 'Overhead' && acDc === 'AC';
  const replacesExistingLine =
    projectType === 'reconductoring' || projectType === 'rebuild';
  const showDedicated = sendingSource === 'dedicated';

  useEffect(() => {
    syncCapacity(acDc, capacity, CAPACITY_PATH, setFieldValue);
  }, [acDc, capacity, setFieldValue]);

  useEffect(() => {
    syncConductor(constructionType, conductor, CONDUCTOR_PATH, setFieldValue);
  }, [constructionType, conductor, setFieldValue]);

  useEffect(() => {
    if (!replacesExistingLine) return;
    syncCapacity(oldAcDc, oldCapacity, OLD_CAPACITY_PATH, setFieldValue);
  }, [replacesExistingLine, oldAcDc, oldCapacity, setFieldValue]);

  useEffect(() => {
    if (!replacesExistingLine) return;
    syncConductor(constructionType, oldConductor, OLD_CONDUCTOR_PATH, setFieldValue);
  }, [replacesExistingLine, constructionType, oldConductor, setFieldValue]);

  return (
    <section id="technology" className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <SelectField
        path={CONSTRUCTION_TYPE_PATH}
        label="Construction type"
        helpText="Overhead or underground transmission."
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
      <SelectField
        path={SENDING_SOURCE_PATH}
        label="Sending-end source"
        helpText="Regional margin is the default. Dedicated uses a contract price and three emission rates."
        options={SENDING_SOURCE_OPTIONS}
      />
      {showDedicated ? (
        <>
          <CurrencyField
            path={CONTRACT_PRICE_PATH}
            label="Contract price ($/MWh)"
            helpText="All-in contract price for energy and capacity."
            nullable
          />
          <NumberField
            path={EMISSION_CO2E_PATH}
            label="CO2e emission rate (kg/MWh)"
            helpText="Dedicated resource CO2e rate. A wind or solar resource enters 0."
            min={0}
            nullable
          />
          <NumberField
            path={EMISSION_SO2_PATH}
            label="SO2 emission rate (kg/MWh)"
            helpText="Dedicated resource SO2 rate. A wind or solar resource enters 0."
            min={0}
            nullable
          />
          <NumberField
            path={EMISSION_NOX_PATH}
            label="NOx emission rate (kg/MWh)"
            helpText="Dedicated resource NOx rate. A wind or solar resource enters 0."
            min={0}
            nullable
          />
        </>
      ) : null}
      {replacesExistingLine ? (
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
      {showCorona ? (
        <div className="grid gap-2 sm:col-span-2">
          <h3 className="text-sm font-semibold text-slate-900">
            Corona Losses (AC Overhead)
          </h3>
          <p className="text-sm text-slate-600">{CORONA_HELP}</p>
          <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
            <table className="w-full border-collapse">
              <caption className="sr-only">
                Corona loss by voltage class for AC overhead lines
              </caption>
              <thead>
                <tr className="border-b-2 border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-3 py-2">Voltage ceiling (kV)</th>
                  <th className="px-3 py-2">Corona loss (kW/mile)</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: CORONA_TIER_COUNT }, (_, tier) => {
                  const openTier = tier === CORONA_TIER_COUNT - 1;
                  const ceilingPath = `${CORONA}[${tier}].max_kv`;
                  const lossPath = `${CORONA}[${tier}].kw_per_mile`;
                  return (
                    <tr key={tier} className="border-b last:border-b-0">
                      <td className={cellFieldClass}>
                        {openTier ? (
                          <Input
                            id={ceilingPath}
                            value="∞"
                            disabled
                            readOnly
                            aria-label="Open upper bound"
                          />
                        ) : (
                          <NumberField
                            path={ceilingPath}
                            label={`Voltage ceiling, tier ${tier + 1} (kV)`}
                            helpText={CORONA_HELP}
                            min={0}
                          />
                        )}
                      </td>
                      <td className={cellFieldClass}>
                        <NumberField
                          path={lossPath}
                          label={`Corona loss, tier ${tier + 1} (kW/mile)`}
                          helpText={CORONA_HELP}
                          min={0}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
