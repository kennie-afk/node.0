import { Tabs } from '../../ui';

export type CareTab = 'followups' | 'prayer';

export function CareTabs({ active }: { active: CareTab }) {
  return (
    <Tabs label="Pastoral care sections" active={active} tabs={[{ key: 'followups', label: 'Follow-ups and members', to: '/care' }, { key: 'prayer', label: 'Prayer requests', to: '/care/prayer-requests' }]} />
  );
}
