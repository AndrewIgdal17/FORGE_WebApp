import { useState } from 'react';
import type { ChangeEvent, ReactElement } from 'react';
import { FormField } from '@/components/form/form-field';
import { Input } from '@/components/ui/input';
import { useFormStore } from '@/stores/form-store';

export interface CurrencyFieldProps {
  path: string;
  label: string;
  helpText?: string;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/[$,]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatCurrencyDisplay(value: unknown): string {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return '';
  return `$${parsed.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function parseCurrencyInput(raw: string): number | null {
  const cleaned = raw.replace(/[$,]/g, '').trim();
  if (cleaned === '' || cleaned === '-' || cleaned === '.' || cleaned === '-.') {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function CurrencyField({
  path,
  label,
  helpText,
}: CurrencyFieldProps): ReactElement {
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
    const parsed = parseCurrencyInput(next);
    if (parsed !== null) setFieldValue(path, parsed);
  }

  return (
    <FormField label={label} htmlFor={path} helpText={helpText}>
      <Input
        id={path}
        type="text"
        inputMode="decimal"
        value={focused ? draft : formatCurrencyDisplay(value)}
        onFocus={handleFocus}
        onBlur={() => setFocused(false)}
        onChange={handleChange}
      />
    </FormField>
  );
}
