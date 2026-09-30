import type { ReactNode } from 'react';
import '../ops.css';

/** Every operations page sits in this wrapper: the kit's page rhythm plus the ops stylesheet. */
export function OpsPage({ children }: { children: ReactNode }) {
  return <div className="ui-page">{children}</div>;
}
