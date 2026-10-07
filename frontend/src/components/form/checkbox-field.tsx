import type { ReactElement } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/form/form-field';
import { useFormStore } from '@/stores/form-store';

export interface CheckboxFieldProps {
  path: string;
  label: string;
  helpText?: string;
}

export function CheckboxField({
  path,
  label,
  helpText,
}: CheckboxFieldProps): ReactElement {
  const value = useFormStore((state) => state.getFieldValue(path));
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const checked = value === true || value === 'true';

  return (
    <FormField label={label} htmlFor={path} helpText={helpText}>
      <Checkbox
        id={path}
        checked={checked}
        onCheckedChange={(next) => {
          setFieldValue(path, next);
        }}
      />
    </FormField>
  );
}
