import type { ReactElement } from 'react';
import { PercentageField } from '@/components/form/percentage-field';
import { useFormStore } from '@/stores/form-store';

const FINANCIAL = '03_financing.financial';
const WACC_PATH = `${FINANCIAL}.wacc_nominal`;
const SPENDING = '19_cost_timing_patterns.construction_spending_profiles';
const SPENDING_YEARS = 8;
const SPENDING_HELP =
  'Share of construction spend in each year. The calculator pools these into one S-curve and resamples to the construction duration. A 1-year project ignores these weights.';

const SPENDING_PROFILES: Array<{ key: string; years: number; label: string }> = [
  { key: '5', years: 5, label: '5-year' },
  { key: '6', years: 6, label: '6-year' },
  { key: '7', years: 7, label: '7-year' },
  { key: '8', years: 8, label: '8-year' },
];

const cellFieldClass = 'px-2 py-1.5 [&_label]:sr-only';

function readDecimal(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function formatPercent(decimal: number): string {
  return `${(decimal * 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function spendingPath(profile: string, yearIndex: number): string {
  return `${SPENDING}.${profile}[${yearIndex}]`;
}

export function AfudcPanel(): ReactElement {
  const wacc = useFormStore((state) => state.getFieldValue(WACC_PATH));
  const nominal = readDecimal(wacc);

  return (
    <section id="afudc" className="grid max-w-6xl gap-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">AFUDC</h2>
        <p className="text-sm text-slate-600">
          AFUDC always applies: eligible spending compounds at the nominal WACC until commercial operation.
        </p>
      </div>
      <p className="text-sm text-slate-600">
        AFUDC rate (nominal WACC){' '}
        <span className="font-medium text-slate-900">
          {nominal === null ? '—' : formatPercent(nominal)}
        </span>
      </p>
      <div className="grid gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Construction Spending Profiles</h3>
        <p className="text-sm text-slate-600">{SPENDING_HELP}</p>
      </div>
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full min-w-[52rem] border-collapse">
          <caption className="sr-only">
            Construction spending profiles: share of spend in each year of a 5- to 8-year schedule
          </caption>
          <thead>
            <tr className="border-b-2 border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-3 py-2">Profile</th>
              {Array.from({ length: SPENDING_YEARS }, (_, year) => (
                <th key={year} className="px-3 py-2">
                  Year {year + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SPENDING_PROFILES.map((profile) => (
              <tr key={profile.key} className="border-b last:border-b-0">
                <th scope="row" className="px-3 py-2 text-left text-sm font-medium text-slate-800">
                  {profile.label}
                </th>
                {Array.from({ length: SPENDING_YEARS }, (_, year) => (
                  <td key={year} className={cellFieldClass}>
                    {year < profile.years ? (
                      <PercentageField
                        path={spendingPath(profile.key, year)}
                        label={`${profile.label} year ${year + 1}`}
                        helpText={SPENDING_HELP}
                      />
                    ) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}