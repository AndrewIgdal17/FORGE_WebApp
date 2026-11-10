import type { ReactElement } from 'react';
import { CurrencyField } from '@/components/form/currency-field';
import { NumberField } from '@/components/form/number-field';

const VALUE_OF_LOAD_PATH = '01_project_technical_details.project.value_of_load_per_mwh';
const VOLL = '07_outage_costs.outage.value_of_lost_load.tiers';

const VOLL_TIERS: Array<{ label: string; index: number; hoursEditable: boolean }> = [
  { label: '0–1h', index: 0, hoursEditable: true },
  { label: '1–2h', index: 1, hoursEditable: true },
  { label: '2–4h', index: 2, hoursEditable: true },
  { label: '4–8h', index: 3, hoursEditable: true },
  { label: '8–16h', index: 4, hoursEditable: true },
  { label: '16–32h', index: 5, hoursEditable: true },
  { label: '32–64h', index: 6, hoursEditable: true },
  { label: '64h–7d', index: 7, hoursEditable: true },
  { label: '7–30d', index: 8, hoursEditable: true },
  { label: '>30d', index: 9, hoursEditable: false },
];

const cellFieldClass = 'px-2 py-1.5 [&_label]:sr-only';

function hoursPath(index: number): string {
  return `${VOLL}[${index}].max_hours`;
}

function valuePath(index: number): string {
  return `${VOLL}[${index}].value_per_mwh`;
}

export function EconomicDetails(): ReactElement {
  return (
    <section id="economic-details" className="grid max-w-3xl gap-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Economic details</h2>
        <p className="text-sm text-slate-600">
          Value of delivered energy and the value of lost load by outage duration.
        </p>
      </div>
      <CurrencyField
        path={VALUE_OF_LOAD_PATH}
        label="Receiving-end energy value ($/MWh)"
        helpText="Prices losses, and delivered energy for a dedicated resource. Zero or greater."
        nullable
      />
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full min-w-[32rem] border-collapse">
          <caption className="sr-only">Value of lost load by outage duration tier</caption>
          <thead>
            <tr className="border-b-2 border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-3 py-2">Duration tier</th>
              <th className="px-3 py-2">Max hours</th>
              <th className="px-3 py-2">Value ($/MWh)</th>
            </tr>
          </thead>
          <tbody>
            {VOLL_TIERS.map((tier) => (
              <tr key={tier.index} className="border-b last:border-b-0">
                <th scope="row" className="px-3 py-2 text-left text-sm font-medium text-slate-800">
                  {tier.label}
                </th>
                <td className={cellFieldClass}>
                  {tier.hoursEditable ? (
                    <NumberField
                      path={hoursPath(tier.index)}
                      label={`${tier.label} max hours`}
                      helpText="Upper bound of this duration tier, in hours."
                      min={0}
                    />
                  ) : (
                    <span className="px-2 text-sm text-slate-700" aria-label="No upper bound">
                      ∞
                    </span>
                  )}
                </td>
                <td className={cellFieldClass}>
                  <CurrencyField
                    path={valuePath(tier.index)}
                    label={`${tier.label} value per MWh`}
                    helpText="Cost of unserved energy for outages in this duration range."
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
