import { Tabs } from '../../ui';

export type CommsTab = 'campaigns' | 'templates' | 'segments' | 'outbox';

export function CommsTabs({ active }: { active: CommsTab }) {
  return (
    <Tabs
      label="Communications sections"
      active={active}
      tabs={[
        { key: 'campaigns', label: 'Campaigns', to: '/comms/campaigns' },
        { key: 'templates', label: 'Templates', to: '/comms/templates' },
        { key: 'segments', label: 'Audiences', to: '/comms/segments' },
        { key: 'outbox', label: 'Delivery log', to: '/comms/outbox' }
      ]}
    />
  );
}
