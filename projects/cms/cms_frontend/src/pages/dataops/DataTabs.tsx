import { Tabs } from '../../ui';
import { useAuth } from '../../context/auth-context';

export type DataTab = 'import' | 'exports' | 'consents' | 'access' | 'erasure';

export function DataTabs({ active }: { active: DataTab }) {
  const { can } = useAuth();
  const tabs = [
    can('members:write') && { key: 'import' as const, label: 'Import members', to: '/data/import' },
    can('members:read') && { key: 'exports' as const, label: 'Exports', to: '/data/exports' },
    can('members:read') && { key: 'consents' as const, label: 'Consent records', to: '/data/consents' },
    can('users:manage') && { key: 'access' as const, label: 'Subject access', to: '/data/subject-access' },
    can('users:manage') && { key: 'erasure' as const, label: 'Erasure', to: '/data/erasure' }
  ].filter((t): t is { key: DataTab; label: string; to: string } => Boolean(t));
  return <Tabs label="Data and privacy sections" active={active} tabs={tabs} />;
}
