import { useState } from 'react';
import type { ChangeEvent, ReactElement } from 'react';
import { FormField } from '@/components/form/form-field';
import { Input } from '@/components/ui/input';
import { useFormStore } from '@/stores/form-store';

export interface PercentageFieldProps {
  path: string;
  label: string;
  helpText?: string;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Stored decimals render as percents: 0.54 → "54". */
function formatPercentDisplay(value: unknown): string {
  const decimal = toFiniteNumber(value);
  if (decimal === null) return '';
  const percent = decimal * 100;
  const asInteger = Math.round(percent);
  if (Math.abs(percent - asInteger) < 1e-6) return String(asInteger);
  return String(Math.round(percent * 1e8) / 1e8);
}

function parsePercentInput(raw: string): number | null {
  const cleaned = raw.replace(/[%,]/g, '').trim();
  if (cleaned === '' || cleaned === '-' || cleaned === '.' || cleaned === '-.') {
    return null;
  }
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return parsed / 100;
}

export function PercentageField({
  path,
  label,
  helpText,
}: PercentageFieldProps): ReactElement {
  const value = useFormStore((state) => state.getFieldValue(path));
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');

  function handleFocus(): void {
    setDraft(formatPercentDisplay(value));
    setFocused(true);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const next = event.target.value;
    setDraft(next);
    const parsed = parsePercentInput(next);
    if (parsed !== null) setFieldValue(path, parsed);
  }

  return (
    <FormField label={label} htmlFor={path} helpText={helpText}>
      <Input
        id={path}
        type="text"
        inputMode="decimal"
        value={focused ? draft : formatPercentDisplay(value)}
        onFocus={handleFocus}
        onBlur={() => setFocused(false)}
        onChange={handleChange}
      />
    </FormField>
  );
}
