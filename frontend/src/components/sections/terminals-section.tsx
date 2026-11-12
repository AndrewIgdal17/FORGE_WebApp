import type { ReactElement } from 'react';
import { TextField } from '@/components/form/text-field';
import { TERMINAL_PATHS } from '@/components/sections/terminal-paths';

const TERMINAL_LABELS: Record<(typeof TERMINAL_PATHS)[number], string> = {
  '01_project_technical_details.terminals.sending.gea': 'Sending terminal GEA region',
  '01_project_technical_details.terminals.sending.egrid_subregion':
    'Sending terminal eGRID subregion',
  '01_project_technical_details.terminals.sending.state': 'Sending terminal state',
  '01_project_technical_details.terminals.receiving.gea': 'Receiving terminal GEA region',
  '01_project_technical_details.terminals.receiving.egrid_subregion':
    'Receiving terminal eGRID subregion',
  '01_project_technical_details.terminals.receiving.state': 'Receiving terminal state',
};

export function TerminalsSection(): ReactElement {
  return (
    <section id="terminals" className="grid max-w-xl gap-4">
      <p className="text-sm text-slate-600">Drawing a route fills these regions.</p>
      {TERMINAL_PATHS.map((path) => (
        <TextField
          key={path}
          path={path}
          label={TERMINAL_LABELS[path]}
          helpText={`${TERMINAL_LABELS[path]}. Route analysis fills this. No default.`}
          readOnly
        />
      ))}
    </section>
  );
}
