import type { ChangeEvent, ReactElement } from 'react';
import { FormField } from '@/components/form/form-field';
import { Input } from '@/components/ui/input';
import { useFormStore } from '@/stores/form-store';

export interface TextFieldProps {
  path: string;
  label: string;
  helpText?: string;
  readOnly?: boolean;
}

export function TextField({
  path,
  label,
  helpText,
  readOnly = false,
}: TextFieldProps): ReactElement {
  const value = useFormStore((state) => state.getFieldValue(path));
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const text = value === undefined || value === null ? '' : String(value);

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    setFieldValue(path, event.target.value);
  }

  return (
    <FormField label={label} htmlFor={path} helpText={helpText}>
      <div className="flex items-center gap-2">
        <Input
          id={path}
          type="text"
          value={text}
          disabled={readOnly}
          onChange={readOnly ? undefined : handleChange}
        />
        {readOnly ? (
          <span className="shrink-0 text-xs text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded">
            From route
          </span>
        ) : null}
      </div>
    </FormField>
  );
}
