import { useEffect, useState, type ReactElement } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CAPACITY_OPTIONS_BY_AC_DC,
  CONDUCTOR_TYPE_BY_CONSTRUCTION,
} from '@/data/configs';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface DesignComparisonProps {
  results: Record<string, unknown>;
  isReconductoring: boolean;
  acDc: string;
  constructionType: string;
}

interface DesignSide {
  capacityMw: number | null;
  conductorType: string | null;
  lossPercent: number | null;
}

interface ComparisonMethod {
  description: string | null;
  deltaMwhYr: number | null;
  annualCost: number | null;
  lifetimeNominal: number | null;
  npv: number | null;
}

interface DesignComparisonData {
  primary: DesignSide;
  comparison: DesignSide;
  methods: Partial<Record<MethodKey, ComparisonMethod>>;
}

const METHOD_ENTRIES = [
  { key: 'direct', label: 'Direct Comparison', startExpanded: true },
  { key: 'counterfactual', label: 'Counterfactual Comparison', startExpanded: false },
  { key: 'normalized', label: 'Normalized Comparison', startExpanded: false },
] as const;

type MethodKey = (typeof METHOD_ENTRIES)[number]['key'];

const CONDUCTOR_FALLBACK = ['Standard Aluminum Conductor'] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function readNumber(record: Record<string, unknown> | null, key: string): number | null {
  if (!record) return null;
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readString(record: Record<string, unknown> | null, key: string): string | null {
  if (!record) return null;
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readSide(value: unknown): DesignSide {
  const record = asRecord(value);
  return {
    capacityMw: readNumber(record, 'capacity_mw'),
    conductorType: readString(record, 'conductor_type'),
    lossPercent: readNumber(record, 'loss_percent'),
  };
}

function readMethod(value: unknown): ComparisonMethod | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    description: readString(record, 'description'),
    deltaMwhYr: readNumber(record, 'delta_mwh_yr'),
    annualCost: readNumber(record, 'annual_cost'),
    lifetimeNominal: readNumber(record, 'lifetime_nominal'),
    npv: readNumber(record, 'npv'),
  };
}

function readDesignComparison(results: Record<string, unknown>): DesignComparisonData | null {
  const costs = asRecord(results.costs);
  const comparison = asRecord(costs?.design_comparison);
  if (!comparison) return null;
  const methods = asRecord(comparison.methods);
  const parsedMethods: DesignComparisonData['methods'] = {};
  for (const entry of METHOD_ENTRIES) {
    const method = readMethod(methods?.[entry.key]);
    if (method) parsedMethods[entry.key] = method;
  }
  return {
    primary: readSide(comparison.primary),
    comparison: readSide(comparison.comparison),
    methods: parsedMethods,
  };
}

function capacityChoices(acDc: string): readonly number[] {
  if (acDc === 'DC') return CAPACITY_OPTIONS_BY_AC_DC.DC;
  return CAPACITY_OPTIONS_BY_AC_DC.AC;
}

function conductorChoices(constructionType: string): readonly string[] {
  return CONDUCTOR_TYPE_BY_CONSTRUCTION[constructionType] ?? CONDUCTOR_FALLBACK;
}

function formatLoose(value: number | null, digits = 0): string {
  if (value == null) return '—';
  return value.toLocaleString('en-US', { maximumFractionDigits: digits });
}

function lossRateLabel(lossPercent: number | null): string {
  if (lossPercent == null) return 'Loss rate: —';
  return `Loss rate: ${lossPercent.toFixed(2)}%`;
}

function moneyClass(value: number | null): string | undefined {
  return value != null && value < 0 ? 'text-red-600' : undefined;
}

function ConfigCard({
  title,
  side,
  highlight,
}: {
  title: string;
  side: DesignSide;
  highlight?: boolean;
}): ReactElement {
  return (
    <Card className={highlight ? 'ring-2 ring-primary' : undefined}>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-xl tabular-nums">
          {formatLoose(side.capacityMw)} MW
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm text-muted-foreground">
        <p>{side.conductorType ?? '—'}</p>
        <p>{lossRateLabel(side.lossPercent)}</p>
      </CardContent>
    </Card>
  );
}

function MoneyLine({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: number | null;
  emphasize?: boolean;
}): ReactElement {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 text-sm',
        emphasize && 'border-t pt-2 font-semibold',
      )}
    >
      <span>{label}</span>
      <span className={cn('tabular-nums', moneyClass(value))}>
        {value == null ? '—' : formatCurrency(value, 0)}
      </span>
    </div>
  );
}

function MethodSection({
  label,
  method,
  startExpanded,
}: {
  label: string;
  method: ComparisonMethod;
  startExpanded: boolean;
}): ReactElement {
  const [expanded, setExpanded] = useState(startExpanded);
  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 py-2 text-left text-sm font-semibold"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
      >
        {label}
        <ChevronRight
          className={cn(
            'size-4 text-muted-foreground transition-transform',
            expanded && 'rotate-90 text-primary',
          )}
          aria-hidden
        />
      </button>
      {expanded ? (
        <div className="space-y-2 pb-3">
          {method.description ? (
            <p className="text-sm text-muted-foreground">{method.description}</p>
          ) : null}
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>Loss Difference (MWh/yr)</span>
            <span className="tabular-nums">{formatLoose(method.deltaMwhYr, 1)}</span>
          </div>
          <MoneyLine label="Annual Cost Difference" value={method.annualCost} />
          <MoneyLine label="Lifetime Nominal" value={method.lifetimeNominal} />
          <MoneyLine label="Net Present Value" value={method.npv} emphasize />
        </div>
      ) : null}
    </div>
  );
}

function ComparisonResults({ data }: { data: DesignComparisonData }): ReactElement {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <ConfigCard title="Your Project" side={data.primary} />
        <ConfigCard title="Alternative" side={data.comparison} highlight />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Alternative design costs</CardTitle>
          <CardDescription>
            Positive values mean the primary design has higher losses (costs more).
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {METHOD_ENTRIES.map((entry) => {
            const method = data.methods[entry.key];
            if (!method) return null;
            return (
              <MethodSection
                key={entry.key}
                label={entry.label}
                method={method}
                startExpanded={entry.startExpanded}
              />
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

export function DesignComparison({
  results,
  isReconductoring,
  acDc,
  constructionType,
}: DesignComparisonProps): ReactElement {
  const data = readDesignComparison(results);
  const capacities = capacityChoices(acDc);
  const conductors = conductorChoices(constructionType);
  const [capacity, setCapacity] = useState('');
  const [conductor, setConductor] = useState('');

  const comparedCapacity = data?.comparison.capacityMw;
  const comparedConductor = data?.comparison.conductorType;

  useEffect(() => {
    if (comparedCapacity == null) return;
    const next = String(comparedCapacity);
    if (capacities.some((option) => String(option) === next)) {
      setCapacity(next);
    }
  }, [comparedCapacity, capacities]);

  useEffect(() => {
    if (!comparedConductor) return;
    if (conductors.includes(comparedConductor)) {
      setConductor(comparedConductor);
    }
  }, [comparedConductor, conductors]);

  useEffect(() => {
    if (capacity !== '' && !capacities.some((option) => String(option) === capacity)) {
      setCapacity('');
    }
  }, [capacity, capacities]);

  useEffect(() => {
    if (conductor !== '' && !conductors.includes(conductor)) {
      setConductor('');
    }
  }, [conductor, conductors]);

  if (!isReconductoring) {
    return (
      <p className="text-sm text-muted-foreground">
        Design comparison is available for reconductoring projects.
      </p>
    );
  }

  const ready = capacity !== '' && conductor !== '';

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Line Losses Under Alternative Designs</h2>
        <p className="text-sm text-muted-foreground">
          How would line losses change if this route used a different capacity or conductor?
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="design-cmp-capacity">Capacity</Label>
          <Select
            modal={false}
            value={capacity || null}
            onValueChange={(next) => setCapacity(next ?? '')}
          >
            <SelectTrigger id="design-cmp-capacity" className="w-full">
              <SelectValue placeholder="Select capacity" />
            </SelectTrigger>
            <SelectContent>
              {capacities.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option} MW
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="design-cmp-conductor">Conductor</Label>
          <Select
            modal={false}
            value={conductor || null}
            onValueChange={(next) => setConductor(next ?? '')}
          >
            <SelectTrigger id="design-cmp-conductor" className="w-full">
              <SelectValue placeholder="Select conductor" />
            </SelectTrigger>
            <SelectContent>
              {conductors.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button type="button" disabled={!ready}>
        Run Comparison
      </Button>
      <p className="text-sm text-muted-foreground">
        {ready
          ? `Alternative: ${capacity} MW · ${conductor}. The comparison runs on the server during Calculate.`
          : 'Select a capacity and a conductor. The comparison runs on the server during Calculate.'}
      </p>

      {data ? <ComparisonResults data={data} /> : null}
    </div>
  );
}
