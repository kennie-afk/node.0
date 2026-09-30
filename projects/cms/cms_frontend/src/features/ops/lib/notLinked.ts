import type { ApiError } from '../../../api/http';

/** The server says 403 "not linked to a member record" for every /me call until an administrator links the sign-in. */
export function isNotLinked(error: ApiError | null | undefined): boolean {
  return Boolean(error && error.status === 403 && /not linked/i.test(error.message));
}
