import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { NumberField } from '@/components/form/number-field';
import { PercentageField } from '@/components/form/percentage-field';
import { FuelMixChart } from '@/components/results/fuel-mix-chart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getGridMixPresets } from '@/lib/api';
import type { GridMixPreset, GridMixShares } from '@/lib/api';
import { useFormStore } from '@/stores/form-store';

const MIX = '18_energy_source_mix.grid_mix';

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

type Fuel = (typeof FUELS)[number];
type MixGroup = 'initial' | 'rate_pre_cod' | 'rate_post_cod';

const FUEL_LABELS: Record<Fuel, string> = {
  coal: 'Coal',
  oil: 'Oil',
  natural_gas: 'Natural gas',
  solar: 'Solar',
  wind: 'Wind',
  hydro: 'Hydro',
  nuclear: 'Nuclear',
  other: 'Other',
};

const GROUPS: MixGroup[] = ['initial', 'rate_pre_cod', 'rate_post_cod'];

const cellFieldClass = 'px-2 py-1.5 [&_label]:sr-only';

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function mixPath(group: MixGroup, fuel: Fuel): string {
  return `${MIX}.${group}.${fuel}`;
}

export function EnergyMixSection(): ReactElement {
  const [presets, setPresets] = useState<GridMixPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const shares = useFormStore((state) => {
    const next: Record<string, number> = {};
    for (const fuel of FUELS) {
      next[fuel] = readNumber(state.getFieldValue(mixPath('initial', fuel)));
    }
    return next;
  });
  const initialTotal = FUELS.reduce((sum, fuel) => sum + (shares[fuel] ?? 0), 0);

  useEffect(() => {
    let active = true;
    getGridMixPresets()
      .then((next) => {
        if (active) setPresets(next);
      })
      .catch(() => {
        if (active) setPresets([]);
      });
    return () => {
      active = false;
    };
  }, []);

  function applyPreset(preset: GridMixPreset): void {
    for (const group of GROUPS) {
      const block: GridMixShares = preset.grid_mix[group];
      for (const fuel of FUELS) {
        setFieldValue(mixPath(group, fuel), block[fuel]);
      }
    }
  }

  const presetOptions = presets.map((preset) => ({
    value: preset.id,
    label: preset.label,
  }));

  return (
    <section id="energy-emissions-energy" className="grid max-w-5xl gap-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Energy mix</h2>
        <p className="text-sm text-slate-600">
          Initial shares are percents and should sum to 100. Pre-COD and post-COD rates are annual changes, stored as decimals and shown as percents.
        </p>
      </div>
      {presetOptions.length > 0 ? (
        <div className="grid max-w-md gap-1.5">
          <span className="text-sm font-medium text-slate-800">Grid mix preset</span>
          <Select
            value={selectedPreset}
            items={presetOptions}
            onValueChange={(next) => {
              if (next == null) return;
              const preset = presets.find((item) => item.id === next);
              if (!preset) return;
              setSelectedPreset(next);
              applyPreset(preset);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a preset" />
            </SelectTrigger>
            <SelectContent>
              {presetOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedPreset ? (
            <p className="text-sm text-slate-600">
              {presets.find((preset) => preset.id === selectedPreset)?.description}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full min-w-[44rem] border-collapse">
          <caption className="sr-only">Fuel source initial share and growth rates</caption>
          <thead>
            <tr className="border-b text-left text-xs font-medium text-slate-500">
              <th className="px-3 py-2">Fuel source</th>
              <th className="px-3 py-2">Initial share (%)</th>
              <th className="px-3 py-2">Pre-COD rate (%)</th>
              <th className="px-3 py-2">Post-COD rate (%)</th>
            </tr>
          </thead>
          <tbody>
            {FUELS.map((fuel) => (
              <tr key={fuel} className="border-b last:border-b-0">
                <th scope="row" className="px-3 py-2 text-left text-sm font-medium text-slate-800">
                  {FUEL_LABELS[fuel]}
                </th>
                <td className={cellFieldClass}>
                  <NumberField
                    path={mixPath('initial', fuel)}
                    label={`${FUEL_LABELS[fuel]} initial share`}
                    helpText="Year-0 share of this fuel, in percent. Shares should sum to 100."
                    min={0}
                  />
                </td>
                <td className={cellFieldClass}>
                  <PercentageField
                    path={mixPath('rate_pre_cod', fuel)}
                    label={`${FUEL_LABELS[fuel]} pre-COD rate`}
                    helpText="Annual change in this fuel's share before COD, without the line."
                  />
                </td>
                <td className={cellFieldClass}>
                  <PercentageField
                    path={mixPath('rate_post_cod', fuel)}
                    label={`${FUEL_LABELS[fuel]} post-COD rate`}
                    helpText="Annual change in this fuel's share after COD, with the line."
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-slate-600">
        Initial shares total{' '}
        <span className="font-medium text-slate-900">
          {initialTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })}%
        </span>
      </p>
      <FuelMixChart shares={shares} labels={FUEL_LABELS} />
    </section>
  );
}
