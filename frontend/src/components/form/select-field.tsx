import type { ReactElement } from 'react';
import { FormField } from '@/components/form/form-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFormStore } from '@/stores/form-store';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps {
  path: string;
  label: string;
  helpText?: string;
  options: SelectOption[];
}

function readSelectValue(value: unknown): string | null {
  if (typeof value === 'string' && value !== '') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

export function SelectField({
  path,
  label,
  helpText,
  options,
}: SelectFieldProps): ReactElement {
  const value = useFormStore((state) => state.getFieldValue(path));
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const selected = readSelectValue(value);

  return (
    <FormField label={label} htmlFor={path} helpText={helpText}>
      <Select
        value={selected}
        items={options}
        onValueChange={(next) => {
          if (next == null) return;
          setFieldValue(path, next);
        }}
      >
        <SelectTrigger id={path} className="w-full">
          <SelectValue placeholder="— Select —">
            {(current) => {
              if (typeof current !== 'string') return null;
              return options.find((option) => option.value === current)?.label ?? current;
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}
