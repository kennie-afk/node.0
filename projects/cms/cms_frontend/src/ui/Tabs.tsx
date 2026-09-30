import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

interface TabItem<K extends string> {
  key: K;
  label: ReactNode;
  /** When set the tab is a route link (deep-linkable) instead of local state. */
  to?: string;
}

interface Props<K extends string> {
  tabs: Array<TabItem<K>>;
  active: K;
  onChange?: (key: K) => void;
  label?: string;
}

export function Tabs<K extends string>({ tabs, active, onChange, label = 'Sections' }: Props<K>) {
  return (
    <div className="ui-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) =>
        tab.to ? (
          <NavLink key={tab.key} to={tab.to} role="tab" aria-selected={tab.key === active} className="ui-tab">
            {tab.label}
          </NavLink>
        ) : (
          <button key={tab.key} type="button" role="tab" aria-selected={tab.key === active} className="ui-tab" onClick={() => onChange?.(tab.key)}>
            {tab.label}
          </button>
        )
      )}
    </div>
  );
}
