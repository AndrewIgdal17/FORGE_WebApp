import type { ReactElement, ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import { Label } from '@/components/ui/label';

export interface FormFieldProps {
  label: string;
  htmlFor?: string;
  helpText?: string;
  error?: string;
  children: ReactNode;
}

export function FormField({
  label,
  htmlFor,
  helpText,
  error,
  children,
}: FormFieldProps): ReactElement {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={htmlFor}>{label}</Label>
        {helpText ? (
          <span
            className="inline-flex text-muted-foreground"
            title={helpText}
            aria-label={helpText}
          >
            <CircleHelp className="size-3.5" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
