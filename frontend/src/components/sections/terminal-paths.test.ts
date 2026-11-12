import { expect, test } from 'vitest';
import { TERMINAL_PATHS } from './terminal-paths';

const PREFIX = '01_project_technical_details.terminals.';

test('lists six terminal paths, sending then receiving', () => {
  expect(TERMINAL_PATHS).toHaveLength(6);
  for (const path of TERMINAL_PATHS) {
    expect(path.startsWith(PREFIX)).toBe(true);
  }
  const firstReceiving = TERMINAL_PATHS.findIndex((path) => path.includes('.receiving.'));
  expect(firstReceiving).toBeGreaterThan(0);
  expect(TERMINAL_PATHS.slice(0, firstReceiving).every((path) => path.includes('.sending.'))).toBe(
    true,
  );
  expect(TERMINAL_PATHS.slice(firstReceiving).every((path) => path.includes('.receiving.'))).toBe(
    true,
  );
  expect([...TERMINAL_PATHS]).toEqual([
    `${PREFIX}sending.gea`,
    `${PREFIX}sending.egrid_subregion`,
    `${PREFIX}sending.state`,
    `${PREFIX}receiving.gea`,
    `${PREFIX}receiving.egrid_subregion`,
    `${PREFIX}receiving.state`,
  ]);
});
