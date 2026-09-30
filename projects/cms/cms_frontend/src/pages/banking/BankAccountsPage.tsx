import { Link } from 'react-router-dom';
import { Button, Card, DataTable, EmptyState, PageHeader, StatusPill, useQuery } from '../../ui';
import { listBankAccounts, type BankAccount } from '../../api/bankingApi';
import { useAuth } from '../../context/auth-context';
import { Money } from '../../features/finance/components/common';
import { SectionTabs } from '../../features/finance/components/SectionTabs';

const KIND: Record<string, string> = { CASH: 'Cash', BANK: 'Bank', MPESA_PAYBILL: 'M-Pesa paybill', MPESA_TILL: 'M-Pesa till', PETTY_CASH: 'Petty cash' };

export default function BankAccountsPage() {
  const { can } = useAuth();
  const { data, error, loading, refetch } = useQuery(() => listBankAccounts(true), []);
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Cash and bank accounts" subtitle="Every place money sits, each tied to its own ledger account" actions={can('finance:post') && <Button to="/banking/accounts/new" variant="primary" size="sm">New account</Button>} />
      <SectionTabs section="banking" active="/banking/accounts" />
      <Card flush>
        <DataTable<BankAccount>
          rowKey={(a) => a.id}
          rows={data ?? []}
          loading={loading}
          error={error}
          onRetry={refetch}
          columns={[
            { key: 'name', header: 'Account', render: (a) => <Link to={`/banking/accounts/${a.id}`}>{a.name}</Link> },
            { key: 'kind', header: 'Kind', render: (a) => KIND[a.kind] ?? a.kind },
            { key: 'no', header: 'Number', render: (a) => a.accountNumber ?? '-' },
            { key: 'bal', header: 'Ledger balance', numeric: true, render: (a) => <Money value={a.ledgerBalance ?? '0.00'} strong /> },
            { key: 'float', header: 'Float', numeric: true, render: (a) => (a.float ? <Money value={a.float} /> : '-') },
            { key: 'status', header: 'Status', render: (a) => <StatusPill status={a.isActive ? 'Active' : 'Inactive'} tone={a.isActive ? 'ok' : 'neutral'} /> }
          ]}
          empty={<EmptyState title="No accounts" message="Cash, bank and M-Pesa accounts are created automatically." />}
        />
      </Card>
    </div>
  );
}
