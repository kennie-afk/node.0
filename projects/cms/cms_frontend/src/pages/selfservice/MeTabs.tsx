import { Tabs } from '../../ui';

export type MeTab = 'home' | 'profile' | 'family' | 'groups' | 'giving' | 'prayer' | 'privacy' | 'availability';

export function MeTabs({ active }: { active: MeTab }) {
  return (
    <Tabs
      label="My account"
      active={active}
      tabs={[
        { key: 'home', label: 'Overview', to: '/me' },
        { key: 'profile', label: 'My details', to: '/me/profile' },
        { key: 'family', label: 'My family', to: '/me/family' },
        { key: 'groups', label: 'Groups and events', to: '/me/groups' },
        { key: 'giving', label: 'My giving', to: '/me/giving' },
        { key: 'prayer', label: 'Prayer', to: '/me/prayer' },
        { key: 'availability', label: 'Availability', to: '/me/availability' },
        { key: 'privacy', label: 'Privacy', to: '/me/privacy' }
      ]}
    />
  );
}
