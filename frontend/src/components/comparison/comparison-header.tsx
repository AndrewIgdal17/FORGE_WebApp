import type { ReactElement } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Scenario } from '@/stores/scenario-store';

export interface ComparisonHeaderProps {
  scenario: Scenario;
  isBaseline: boolean;
  onRemove: () => void;
}

export function ComparisonHeader({
  scenario,
  isBaseline,
  onRemove,
}: ComparisonHeaderProps): ReactElement {
  return (
    <div className="flex min-w-36 items-start gap-1">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold" title={scenario.name}>
          {scenario.name}
        </div>
        {isBaseline ? (
          <span className="mt-0.5 inline-flex rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-primary uppercase">
            Baseline
          </span>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove ${scenario.name}`}
        onClick={onRemove}
      >
        <X />
      </Button>
    </div>
  );
}
