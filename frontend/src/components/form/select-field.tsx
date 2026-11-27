import type { ReactElement } from 'react';
import { FormField } from '@/components/form/form-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLineDataPrefill } from '@/lib/line-select';
import { useFormStore } from '@/stores/form-store';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps {
  path: string;
  label: string;
  helpText?: string;
  error?: string;
  options: SelectOption[];
  readOnly?: boolean;
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
  error,
  options,
  readOnly = false,
}: SelectFieldProps): ReactElement {
  const value = useFormStore((state) => state.getFieldValue(path));
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const clearLinePrefill = useLineDataPrefill((state) => state.clearPath);
  const fromLineData = useLineDataPrefill((state) => state.paths.has(path));
  const selected = readSelectValue(value);

  return (
    <FormField label={label} htmlFor={path} helpText={helpText} error={error}>
      <div className="flex items-center gap-2">
        <Select
          value={selected}
          items={options}
          {...(readOnly
            ? {}
            : {
                onValueChange: (next: string | null) => {
                  if (next == null) return;
                  clearLinePrefill(path);
                  setFieldValue(path, next);
                },
              })}
        >
          <SelectTrigger id={path} className="w-full" disabled={readOnly}>
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
        {fromLineData ? (
          <span className="shrink-0 rounded bg-cyan-50 px-1.5 py-0.5 text-xs text-cyan-600">
            from the line data
          </span>
        ) : null}
      </div>
    </FormField>
  );
}
