import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type PerspectiveKey = 'societal' | 'ratepayer' | 'utility';

export const PERSPECTIVE_DEFINITIONS: Record<PerspectiveKey, {
  label: string;
  definition: string;
  bcrPath: string;
  netBenefitPath: string;
}> = {
  societal: {
    label: 'Societal',
    definition: 'Full-cost analysis including all externalities and risk.',
    bcrPath: 'bcr.bcr_societal',
    netBenefitPath: 'bcr.net_benefit_pv',
  },
  ratepayer: {
    label: 'Ratepayer',
    definition: 'Costs and benefits that flow through to ratepayers. Excludes externalities and risk.',
    bcrPath: 'bcr.bcr_ratepayer',
    netBenefitPath: 'bcr.net_benefit_ratepayer_pv',
  },
  utility: {
    label: 'Utility',
    definition: 'Revenue earned against capital deployed, net of delay costs.',
    bcrPath: 'bcr.bcr_utility',
    netBenefitPath: 'bcr.net_benefit_utility_pv',
  },
};

const PERSPECTIVE_ORDER: readonly PerspectiveKey[] = ['societal', 'ratepayer', 'utility'];

export interface PerspectiveToggleProps {
  perspective: PerspectiveKey;
  onPerspectiveChange: (perspective: PerspectiveKey) => void;
}

export function PerspectiveToggle({
  perspective,
  onPerspectiveChange,
}: PerspectiveToggleProps): ReactElement {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Benefit-cost perspective">
        {PERSPECTIVE_ORDER.map((key) => {
          const selected = key === perspective;
          return (
            <Button
              key={key}
              type="button"
              variant={selected ? 'default' : 'outline'}
              aria-pressed={selected}
              className={cn(
                selected && 'bg-accent text-accent-foreground hover:bg-accent/80',
              )}
              onClick={() => {
                onPerspectiveChange(key);
              }}
            >
              {PERSPECTIVE_DEFINITIONS[key].label}
            </Button>
          );
        })}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {PERSPECTIVE_DEFINITIONS[perspective].definition}
      </p>
    </div>
  );
}
