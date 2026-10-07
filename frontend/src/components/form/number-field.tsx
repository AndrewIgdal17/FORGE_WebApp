import { useState } from 'react';
import type { ChangeEvent, ReactElement } from 'react';
import { FormField } from '@/components/form/form-field';
import { Input } from '@/components/ui/input';
import { useFormStore } from '@/stores/form-store';

export interface NumberFieldProps {
  path: string;
  label: string;
  helpText?: string;
  min?: number;
  max?: number;
  step?: number;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatNumberDisplay(value: unknown): string {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return '';
  return parsed.toLocaleString('en-US', { maximumFractionDigits: 10 });
}

function parseNumberInput(raw: string): number | null {
  const cleaned = raw.replace(/,/g, '').trim();
  if (cleaned === '' || cleaned === '-' || cleaned === '.' || cleaned === '-.') {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function NumberField({
  path,
  label,
  helpText,
  min,
  max,
  step,
}: NumberFieldProps): ReactElement {
  const value = useFormStore((state) => state.getFieldValue(path));
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');

  function handleFocus(): void {
    const parsed = toFiniteNumber(value);
    setDraft(parsed === null ? '' : String(parsed));
    setFocused(true);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const next = event.target.value;
    setDraft(next);
    const parsed = parseNumberInput(next);
    if (parsed !== null) setFieldValue(path, parsed);
  }

  return (
    <FormField label={label} htmlFor={path} helpText={helpText}>
      <Input
        id={path}
        type="text"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={focused ? draft : formatNumberDisplay(value)}
        onFocus={handleFocus}
        onBlur={() => setFocused(false)}
        onChange={handleChange}
      />
    </FormField>
  );
}
