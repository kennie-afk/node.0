import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ToastContext, type ToastApi, type ToastTone } from './toast-context';

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const api = useMemo<ToastApi>(() => {
    const show = (message: string, tone: ToastTone = 'info') => {
      const id = next.current++;
      setToasts((all) => [...all.slice(-3), { id, message, tone }]);
      window.setTimeout(() => dismiss(id), tone === 'bad' ? 8000 : 4000);
    };
    return { show, success: (m) => show(m, 'ok'), error: (m) => show(m, 'bad') };
  }, [dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="ui-toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`ui-toast tone-${toast.tone}`} role={toast.tone === 'bad' ? 'alert' : 'status'}>
            <span>{toast.message}</span>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(toast.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
