import type { ChangeEvent, ReactElement } from 'react';
import { FormField } from '@/components/form/form-field';
import { Input } from '@/components/ui/input';
import { useFormStore } from '@/stores/form-store';

export interface TextFieldProps {
  path: string;
  label: string;
  helpText?: string;
}

export function TextField({ path, label, helpText }: TextFieldProps): ReactElement {
  const value = useFormStore((state) => state.getFieldValue(path));
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const text = value === undefined || value === null ? '' : String(value);

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    setFieldValue(path, event.target.value);
  }

  return (
    <FormField label={label} htmlFor={path} helpText={helpText}>
      <Input id={path} type="text" value={text} onChange={handleChange} />
    </FormField>
  );
}
