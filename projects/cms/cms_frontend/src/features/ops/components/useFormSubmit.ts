import { useCallback, useState } from 'react';
import { ApiError, normalizeError } from '../../../api/http';
import { useToast } from '../../../ui';

/**
 * Submit handler for a form page: tracks busy, keeps the server's field errors for the fields,
 * and raises a toast for anything that is not about one field. Returns true on success so the page
 * decides where to go next.
 */
export function useFormSubmit() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const submit = useCallback(
    async (work: () => Promise<unknown>, successMessage?: string): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        await work();
        if (successMessage) toast.success(successMessage);
        return true;
      } catch (failure) {
        const normalised = normalizeError(failure);
        setError(normalised);
        if (normalised.fields.length === 0) toast.error(normalised.message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [toast]
  );

  const fieldError = useCallback((name: string) => error?.fieldMessage(name), [error]);
  return { submit, busy, error, fieldError, clearError: () => setError(null) };
}
