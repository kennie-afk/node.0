import type { ReactNode } from 'react';
import { useAuth } from '../context/auth-context';
import type { Permission } from './permissions';
import { ErrorState } from '../ui/ErrorState';

interface Props {
  /** Any one of these is enough. */
  permission: Permission | readonly Permission[];
  children: ReactNode;
}

/** Route guard: shows a plain "not permitted" state instead of a page that would only 403. */
export function RequirePermission({ permission, children }: Props) {
  const { can } = useAuth();
  const needed = Array.isArray(permission) ? (permission as readonly Permission[]) : [permission as Permission];
  if (needed.some(can)) {
    return <>{children}</>;
  }
  return (
    <ErrorState
      title="You do not have access to this page"
      message={`Your role does not include ${needed.join(' or ')}. Ask a church administrator if you need it.`}
    />
  );
}
