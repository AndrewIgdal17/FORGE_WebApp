import type { SelectOption } from '@/components/form/select-field';
import {
  CAPACITY_OPTIONS_BY_AC_DC,
  CONDUCTOR_TYPE_BY_CONSTRUCTION,
} from '@/data/configs';

export const CONVERTER_OPTIONS: SelectOption[] = [
  { value: 'VSC Converter', label: 'VSC Converter' },
  { value: 'LCC Converter', label: 'LCC Converter' },
];

export function isAcDc(value: unknown): value is 'AC' | 'DC' {
  return value === 'AC' || value === 'DC';
}

export function capacityOptions(acDc: unknown): SelectOption[] {
  if (!isAcDc(acDc)) return [];
  return CAPACITY_OPTIONS_BY_AC_DC[acDc].map((mw) => ({
    value: String(mw),
    label: `${mw.toLocaleString('en-US')} MW`,
  }));
}

export function conductorOptions(constructionType: unknown): SelectOption[] {
  if (typeof constructionType !== 'string') return [];
  const names = CONDUCTOR_TYPE_BY_CONSTRUCTION[constructionType] ?? [];
  return names.map((name) => ({ value: name, label: name }));
}
