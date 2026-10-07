import { toast } from 'sonner';

export { toast };

/** Sonner toasts are global; this hook matches call sites that expect a context. */
export function useToast(): { toast: typeof toast } {
  return { toast };
}
