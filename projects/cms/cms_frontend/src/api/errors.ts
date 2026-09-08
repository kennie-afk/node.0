import axios from 'axios';

interface FieldError {
  field: string;
  message: string;
}

interface ApiFailure {
  message?: string;
  errors?: FieldError[];
}

export function describeError(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error && error.message ? error.message : fallback;
  }

  if (!error.response) {
    return 'The server could not be reached. Check your connection and try again.';
  }

  const status = error.response.status;
  const body = error.response.data as ApiFailure | undefined;

  if (body?.errors?.length) {
    return body.errors.map((issue) => `${humanise(issue.field)}: ${issue.message}`).join('. ');
  }

  if (body?.message) {
    return body.message;
  }

  if (status === 401) {
    return 'Your session has expired. Sign in again.';
  }

  if (status === 429) {
    return 'Too many attempts. Wait a few minutes and try again.';
  }

  return fallback;
}

function humanise(field: string): string {
  const leaf = field.split('.').pop() ?? field;
  const spaced = leaf.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
