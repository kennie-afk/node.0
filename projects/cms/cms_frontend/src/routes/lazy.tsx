import { lazy, Suspense, type ComponentType, type ReactElement } from 'react';
import { RequirePermission } from '../auth/RequirePermission';
import type { Permission } from '../auth/permissions';
import { PageLoader } from '../ui/Skeleton';

/**
 * Code-split page: `lazyPage(() => import('../pages/finance/JournalPage'))` loads its chunk on
 * first visit. Wrap with a permission to get a guard in the same call.
 */
export function lazyPage(
  loader: () => Promise<{ default: ComponentType }>,
  permission?: Permission | readonly Permission[]
): ReactElement {
  const Page = lazy(loader);
  const page = (
    <Suspense fallback={<PageLoader />}>
      <Page />
    </Suspense>
  );
  return permission ? <RequirePermission permission={permission}>{page}</RequirePermission> : page;
}
