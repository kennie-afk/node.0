import { Tabs } from '../../ui';

export type VisitorTab = 'pipeline' | 'list' | 'tasks';

export function VisitorsTabs({ active }: { active: VisitorTab }) {
  return (
    <Tabs
      label="Visitor sections"
      active={active}
      tabs={[
        { key: 'pipeline', label: 'Pipeline', to: '/visitors' },
        { key: 'list', label: 'All visitors', to: '/visitors/list' },
        { key: 'tasks', label: 'Follow-up tasks', to: '/visitors/tasks' }
      ]}
    />
  );
}
