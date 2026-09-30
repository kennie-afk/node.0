import { createContext, useContext } from 'react';

export type ToastTone = 'ok' | 'bad' | 'info';

export interface ToastApi {
  show: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

/** `const toast = useToast(); toast.success('Saved')`. Safe to call outside a provider (no-op). */
export function useToast(): ToastApi {
  return (
    useContext(ToastContext) ?? {
      show: () => undefined,
      success: () => undefined,
      error: () => undefined
    }
  );
}
