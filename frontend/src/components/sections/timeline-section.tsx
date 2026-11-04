import type { ReactElement } from 'react';
import { NumberField } from '@/components/form/number-field';

const TIMELINE = '01_project_technical_details.timeline';

export function TimelineSection(): ReactElement {
  return (
    <section id="timeline" className="grid max-w-xl gap-4">
      <NumberField
        path={`${TIMELINE}.construction_years`}
        label="Construction years"
        helpText="Years of construction after the project starts."
        step={1}
      />
      <NumberField
        path={`${TIMELINE}.delay_years`}
        label="Delay years"
        helpText="Years of delay before construction."
        min={0}
        step={1}
      />
      <NumberField
        path={`${TIMELINE}.project_lifetime`}
        label="Project lifetime (years)"
        helpText="Operating years after the line is in service."
        min={1}
        step={1}
      />
    </section>
  );
}
