import type { ReactElement } from 'react';
import { LEGACY_BANNER } from '@/lib/legacy';

export function LegacyBanner(): ReactElement {
  return (
    <p
      role="status"
      className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      {LEGACY_BANNER}
    </p>
  );
}
