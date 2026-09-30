import { Tabs } from '../../ui';

export type VolunteerTab = 'teams' | 'rosters' | 'swaps' | 'availability' | 'reminders';

export function VolunteersTabs({ active }: { active: VolunteerTab }) {
  return (
    <Tabs
      label="Volunteer sections"
      active={active}
      tabs={[
        { key: 'teams', label: 'Teams', to: '/volunteers/teams' },
        { key: 'rosters', label: 'Rosters', to: '/volunteers/rosters' },
        { key: 'swaps', label: 'Swap requests', to: '/volunteers/swaps' },
        { key: 'availability', label: 'Availability', to: '/volunteers/availability' },
        { key: 'reminders', label: 'Reminders', to: '/volunteers/reminders' }
      ]}
    />
  );
}
