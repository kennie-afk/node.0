import { Tabs } from '../../ui';

export type FacilitiesTab = 'bookings' | 'resources';

export function FacilitiesTabs({ active }: { active: FacilitiesTab }) {
  return (
    <Tabs
      label="Facilities sections"
      active={active}
      tabs={[
        { key: 'bookings', label: 'Bookings', to: '/facilities/bookings' },
        { key: 'resources', label: 'Rooms and equipment', to: '/facilities/resources' }
      ]}
    />
  );
}
