import type { ReactElement } from 'react';
import { CurrencyField } from '@/components/form/currency-field';
import { NumberField } from '@/components/form/number-field';
import { PercentageField } from '@/components/form/percentage-field';

const EMISSIONS = '16_emissions_reductions.emissions_reductions';
const GROWTH_PATH = `${EMISSIONS}.societal_costs_per_kg.co2_cost_annual_growth`;

const FUELS = [
  'coal',
  'oil',
  'natural_gas',
  'solar',
  'wind',
  'hydro',
  'nuclear',
  'other',
] as const;

const FUEL_LABELS: Record<(typeof FUELS)[number], string> = {
  coal: 'Coal',
  oil: 'Oil',
  natural_gas: 'Natural gas',
  solar: 'Solar',
  wind: 'Wind',
  hydro: 'Hydro',
  nuclear: 'Nuclear',
  other: 'Other',
};

const POLLUTANTS = [
  { key: 'co2', label: 'CO₂', unit: 'kg/MWh' },
  { key: 'sox', label: 'SOx', unit: 'kg/MWh' },
  { key: 'nox', label: 'NOx', unit: 'kg/MWh' },
] as const;

const EXTERNALITIES = [
  { key: 'co2_cost_per_kg', label: 'CO₂' },
  { key: 'sox_cost_per_kg', label: 'SOx' },
  { key: 'nox_cost_per_kg', label: 'NOx' },
] as const;

const cellFieldClass = 'px-2 py-1.5 [&_label]:sr-only';

export function EmissionsSection(): ReactElement {
  return (
    <section id="energy-emissions-emissions" className="grid max-w-4xl gap-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Emissions</h2>
        <p className="text-sm text-slate-600">
          Emission intensity by fuel, and the social cost used to value avoided pollution.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full min-w-[36rem] border-collapse">
          <caption className="sr-only">Emission intensity by fuel and pollutant</caption>
          <thead>
            <tr className="border-b-2 border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-3 py-2">Fuel source</th>
              {POLLUTANTS.map((pollutant) => (
                <th key={pollutant.key} className="px-3 py-2">
                  {pollutant.label} ({pollutant.unit})
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FUELS.map((fuel) => (
              <tr key={fuel} className="border-b last:border-b-0">
                <th scope="row" className="px-3 py-2 text-left text-sm font-medium text-slate-800">
                  {FUEL_LABELS[fuel]}
                </th>
                {POLLUTANTS.map((pollutant) => (
                  <td key={pollutant.key} className={cellFieldClass}>
                    <NumberField
                      path={`${EMISSIONS}.emission_intensities.${pollutant.key}_intensity_kg_per_mwh.${fuel}`}
                      label={`${FUEL_LABELS[fuel]} ${pollutant.label} intensity`}
                      helpText={`${pollutant.label} emitted per MWh from ${FUEL_LABELS[fuel].toLowerCase()} generation.`}
                      min={0}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full min-w-[24rem] border-collapse">
          <caption className="sr-only">Externality cost per kilogram</caption>
          <thead>
            <tr className="border-b-2 border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-3 py-2">Pollutant</th>
              <th className="px-3 py-2">Externality ($/kg)</th>
            </tr>
          </thead>
          <tbody>
            {EXTERNALITIES.map((row) => (
              <tr key={row.key} className="border-b last:border-b-0">
                <th scope="row" className="px-3 py-2 text-left text-sm font-medium text-slate-800">
                  {row.label}
                </th>
                <td className={cellFieldClass}>
                  <CurrencyField
                    path={`${EMISSIONS}.societal_costs_per_kg.${row.key}`}
                    label={`${row.label} cost per kg`}
                    helpText={`Social cost per kilogram of ${row.label}.`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid max-w-xl gap-2">
        <PercentageField
          path={GROWTH_PATH}
          label="CO₂ cost annual growth (%)"
          helpText="Real annual escalation of the CO₂ societal cost."
        />
      </div>
    </section>
  );
}
