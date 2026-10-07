import { useMemo, useState, type ReactElement } from 'react';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { formatCurrency, formatNumber } from '@/lib/format';
import { buildResultById, formatCompact } from '@/lib/results-utils';
import { cn } from '@/lib/utils';

export interface CustomBCRPanelProps {
  results: Record<string, unknown>;
  taxonomy?: Record<string, unknown>;
}

interface ExclusionGroup {
  id: string;
  label: string;
  costPv: number;
  benefitPv: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function readFinite(record: Record<string, unknown> | null, key: string): number | null {
  if (!record) return null;
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function sideByTaxonomyId(
  taxonomy: Record<string, unknown> | undefined,
): Map<string, string> {
  const sides = new Map<string, string>();
  const items = taxonomy?.items;
  if (!Array.isArray(items)) return sides;
  for (const item of items) {
    const record = asRecord(item);
    if (!record || typeof record.id !== 'string' || typeof record.side !== 'string') continue;
    sides.set(record.id, record.side);
  }
  return sides;
}

function readGroups(
  taxonomy: Record<string, unknown> | undefined,
  resultById: Record<string, unknown>,
): ExclusionGroup[] {
  const rawGroups = asRecord(taxonomy?.excludable_groups);
  if (!rawGroups) return [];
  const sides = sideByTaxonomyId(taxonomy);
  return Object.entries(rawGroups).map(([groupId, raw]) => {
    const group = asRecord(raw);
    const label = group && typeof group.label === 'string' ? group.label : groupId;
    const ids = group && Array.isArray(group.taxonomy_ids) ? group.taxonomy_ids : [];
    let costPv = 0;
    let benefitPv = 0;
    for (const taxonomyId of ids) {
      if (typeof taxonomyId !== 'string') continue;
      const row = asRecord(resultById[taxonomyId]);
      const pv = readFinite(row, 'value_pv') ?? 0;
      if (sides.get(taxonomyId) === 'benefit' || groupId === 'avoided_emissions') {
        benefitPv += pv;
      } else {
        costPv += pv;
      }
    }
    return { id: groupId, label, costPv, benefitPv };
  });
}

export function CustomBCRPanel({
  results,
  taxonomy,
}: CustomBCRPanelProps): ReactElement {
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());
  const bcr = asRecord(results.bcr);
  const summary = asRecord(results.summary);
  const groups = useMemo(
    () => readGroups(taxonomy, buildResultById(results)),
    [results, taxonomy],
  );

  const totalBenefits =
    readFinite(bcr, 'total_benefits_pv') ?? readFinite(summary, 'total_benefits_pv') ?? 0;
  const totalCosts =
    readFinite(bcr, 'total_costs_pv') ?? readFinite(summary, 'total_costs_pv') ?? 0;

  let excludedBenefits = 0;
  let excludedCosts = 0;
  for (const group of groups) {
    if (!excluded.has(group.id)) continue;
    excludedBenefits += group.benefitPv;
    excludedCosts += group.costPv;
  }

  const benefits = totalBenefits - excludedBenefits;
  const costs = totalCosts - excludedCosts;
  const customBcr = costs > 0 ? benefits / costs : 0;
  const customNetBenefit = benefits - costs;

  function toggleGroup(groupId: string, checked: boolean): void {
    setExcluded((current) => {
      const next = new Set(current);
      if (checked) next.add(groupId);
      else next.delete(groupId);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Exclude cost or benefit groups to recompute the societal BCR and net benefit.
      </p>
      {groups.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {groups.map((group) => {
            const checkboxId = `custom-exc-${group.id}`;
            const amount = group.costPv + group.benefitPv;
            return (
              <Label key={group.id} htmlFor={checkboxId} className="font-normal">
                <Checkbox
                  id={checkboxId}
                  checked={excluded.has(group.id)}
                  onCheckedChange={(checked) => {
                    toggleGroup(group.id, checked);
                  }}
                />
                <span className="min-w-0 flex-1">Exclude {group.label}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatCompact(amount)}
                </span>
              </Label>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No excludable groups in this taxonomy.</p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="bg-primary/5">
          <CardHeader>
            <CardDescription>Custom BCR</CardDescription>
            <CardTitle
              className={cn(
                'text-3xl tabular-nums',
                customBcr >= 1 ? 'text-green-600' : 'text-red-600',
              )}
            >
              {formatNumber(customBcr, 3)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-primary/5">
          <CardHeader>
            <CardDescription>Custom Net Benefit</CardDescription>
            <CardTitle
              className={cn(
                'text-3xl tabular-nums',
                customNetBenefit < 0 && 'text-red-600',
              )}
            >
              {formatCurrency(customNetBenefit, 0)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
