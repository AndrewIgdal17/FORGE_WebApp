import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { CheckboxField } from '@/components/form/checkbox-field';
import { PercentageField } from '@/components/form/percentage-field';
import { SelectField } from '@/components/form/select-field';
import type { SelectOption } from '@/components/form/select-field';
import { useFormStore } from '@/stores/form-store';

const FINANCIAL = '03_financing.financial';

const BASE_YEAR_PATH = `${FINANCIAL}.base_year`;
const INFLATION_PATH = `${FINANCIAL}.inflation_rate`;
const WACC_PATH = `${FINANCIAL}.wacc_nominal`;
const SOCIAL_PATH = `${FINANCIAL}.social_discount_rate`;
const ESCALATION_PATH = `${FINANCIAL}.construction_cost_escalation_rate`;
const REVENUE_PATH = `${FINANCIAL}.revenue.rate_based.enabled`;

const BASE_YEAR_OPTIONS: SelectOption[] = Array.from({ length: 31 }, (_, index) => {
  const year = String(2020 + index);
  return { value: year, label: year };
});

function readDecimal(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatPercent(decimal: number): string {
  return `${(decimal * 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

export function FinancialRates(): ReactElement {
  const baseYear = useFormStore((state) => state.getFieldValue(BASE_YEAR_PATH));
  const inflation = useFormStore((state) => state.getFieldValue(INFLATION_PATH));
  const wacc = useFormStore((state) => state.getFieldValue(WACC_PATH));
  const setFieldValue = useFormStore((state) => state.setFieldValue);

  useEffect(() => {
    if (typeof baseYear !== 'string' || baseYear.trim() === '') return;
    const parsed = Number(baseYear);
    if (Number.isFinite(parsed)) setFieldValue(BASE_YEAR_PATH, parsed);
  }, [baseYear, setFieldValue]);

  const nominal = readDecimal(wacc);
  const inflationRate = readDecimal(inflation);
  let realWacc = '—';
  if (
    nominal !== null &&
    inflationRate !== null &&
    1 + inflationRate !== 0
  ) {
    realWacc = formatPercent((1 + nominal) / (1 + inflationRate) - 1);
  }

  return (
    <section id="rates" className="grid max-w-xl gap-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Financial rates</h2>
        <p className="text-sm text-slate-600">
          Discounting, inflation, and the nominal WACC used as the AFUDC rate.
        </p>
      </div>
      <SelectField
        path={BASE_YEAR_PATH}
        label="Base year"
        helpText="Reference year for all present values (base-year dollars)."
        options={BASE_YEAR_OPTIONS}
      />
      <PercentageField
        path={INFLATION_PATH}
        label="Inflation rate (%)"
        helpText="Annual inflation rate for the Fisher equation."
      />
      <PercentageField
        path={WACC_PATH}
        label="WACC, nominal (%)"
        helpText="Nominal weighted average cost of capital. Also used as the AFUDC rate."
      />
      <p className="text-sm text-slate-600">
        Real WACC (computed){' '}
        <span className="font-medium text-slate-900">{realWacc}</span>
      </p>
      <PercentageField
        path={SOCIAL_PATH}
        label="Social discount rate (%)"
        helpText="Discount rate for social externalities such as risk and emissions."
      />
      <PercentageField
        path={ESCALATION_PATH}
        label="Construction cost escalation (%/yr)"
        helpText="Nominal annual escalation of capital cost during delay. Default 4%/yr. Source: MISO MTEP25 planning methodology (MISO2025CostGuide)."
      />
      <CheckboxField
        path={REVENUE_PATH}
        label="Revenue requirement"
        helpText="Enable rate-based revenue from the declining rate base and real WACC."
      />
    </section>
  );
}
