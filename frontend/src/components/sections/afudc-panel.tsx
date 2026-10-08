import type { ReactElement } from 'react';
import { CheckboxField } from '@/components/form/checkbox-field';
import { PercentageField } from '@/components/form/percentage-field';
import { useFormStore } from '@/stores/form-store';

const FINANCIAL = '03_financing.financial';
const APPLY_PATH = `${FINANCIAL}.afudc.apply_afudc`;
const DELAY_WORK_PATH = `${FINANCIAL}.afudc.delay_period_active_work`;
const WACC_PATH = `${FINANCIAL}.wacc_nominal`;
const TIMING = '19_cost_timing_patterns.cost_timing_patterns';
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

const TIMING_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: 'build_costs', label: 'Build costs' },
  { key: 'row_acquisition', label: 'ROW acquisition' },
  { key: 'environmental_mitigation_base', label: 'Env. mitigation (base)' },
  { key: 'environmental_mitigation_credits', label: 'Env. mitigation (credits)' },
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

function timingPath(category: string, field: string): string {
  return `${TIMING}.${category}.${field}`;
}

function spendingPath(profile: string, yearIndex: number): string {
  return `${SPENDING}.${profile}[${yearIndex}]`;
}

export function AfudcPanel(): ReactElement {
  const applyAfudc = useFormStore((state) => state.getFieldValue(APPLY_PATH));
  const wacc = useFormStore((state) => state.getFieldValue(WACC_PATH));
  const enabled = applyAfudc === true || applyAfudc === 'true';
  const nominal = readDecimal(wacc);

  return (
    <section id="afudc" className="grid max-w-6xl gap-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">AFUDC</h2>
        <p className="text-sm text-slate-600">
          Allowance for funds used during construction compounds eligible costs at the nominal WACC until commercial operation.
        </p>
      </div>
      <CheckboxField
        path={APPLY_PATH}
        label="Apply AFUDC"
        helpText="Capitalize eligible costs from the time they are incurred until COD."
      />
      <p className="text-sm text-slate-600">
        AFUDC rate (nominal WACC){' '}
        <span className="font-medium text-slate-900">
          {nominal === null ? '—' : formatPercent(nominal)}
        </span>
      </p>
      {enabled ? (
        <CheckboxField
          path={DELAY_WORK_PATH}
          label="Delay period active work"
          helpText="AFUDC accrues during delay when permitting, design, or other CWIP-eligible work continues."
        />
      ) : null}
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full min-w-[40rem] border-collapse">
          <caption className="sr-only">
            Cost timing patterns: percent incurred during delay and construction, and AFUDC eligibility
          </caption>
          <thead>
            <tr className="border-b-2 border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-3 py-2">Cost category</th>
              <th className="px-3 py-2">During delay (%)</th>
              <th className="px-3 py-2">During construction (%)</th>
              <th className="px-3 py-2">AFUDC eligible</th>
            </tr>
          </thead>
          <tbody>
            {TIMING_CATEGORIES.map((category) => (
              <tr key={category.key} className="border-b last:border-b-0">
                <th scope="row" className="px-3 py-2 text-left text-sm font-medium text-slate-800">
                  {category.label}
                </th>
                <td className={cellFieldClass}>
                  <PercentageField
                    path={timingPath(category.key, 'during_delay')}
                    label={`${category.label} during delay`}
                    helpText="Percent of this cost incurred during delay."
                  />
                </td>
                <td className={cellFieldClass}>
                  <PercentageField
                    path={timingPath(category.key, 'during_construction')}
                    label={`${category.label} during construction`}
                    helpText="Percent of this cost incurred during construction."
                  />
                </td>
                <td className={cellFieldClass}>
                  <CheckboxField
                    path={timingPath(category.key, 'afudc_eligible')}
                    label={`${category.label} AFUDC eligible`}
                    helpText="Whether this category compounds at the WACC until COD."
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
