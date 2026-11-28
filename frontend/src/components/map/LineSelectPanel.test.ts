import { describe, expect, it } from 'vitest';

import {
  LINE_SELECT_COLLAPSED_CLASS,
  LINE_SELECT_PANEL_CLASS,
} from '@/components/map/LineSelectPanel';

describe('LineSelectPanel position', () => {
  it.each([
    ['panel', LINE_SELECT_PANEL_CLASS],
    ['collapsed button', LINE_SELECT_COLLAPSED_CLASS],
  ])('%s sits at the bottom-left, above the legend chip', (_name, className) => {
    expect(className).toContain('absolute');
    expect(className).toContain('bottom-28');
    expect(className).toContain('left-4');
    expect(className).not.toContain('top-4');
    expect(className).not.toContain('right-4');
  });
});
