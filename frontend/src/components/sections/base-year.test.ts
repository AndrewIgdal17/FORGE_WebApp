import { BASE_YEAR_OPTIONS } from './base-year'
import { test, expect } from 'vitest'

test('base year offers only 2025', () => {
  expect(BASE_YEAR_OPTIONS).toEqual([{ value: '2025', label: '2025' }])
})
