import { Tabs } from '../../ui';

export type CheckinTab = 'station' | 'children' | 'rooms' | 'history' | 'security';

export function CheckinTabs({ active }: { active: CheckinTab }) {
  return (
    <Tabs
      label="Check-in sections"
      active={active}
      tabs={[
        { key: 'station', label: 'Station', to: '/checkin' },
        { key: 'children', label: 'Children', to: '/checkin/children' },
        { key: 'rooms', label: 'Rooms', to: '/checkin/rooms' },
        { key: 'history', label: 'History', to: '/checkin/history' },
        { key: 'security', label: 'Security trail', to: '/checkin/security' }
      ]}
    />
  );
}
