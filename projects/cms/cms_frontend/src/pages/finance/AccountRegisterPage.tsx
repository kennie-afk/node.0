import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, DataTable, DateInput, Field, FilterBar, formatDate, LoadMore, PageHeader } from '../../ui';
import { accountRegister, type Register, type RegisterRow } from '../../api/financeApi';
import { normalizeError, type ApiError } from '../../api/http';
import { Money } from '../../features/finance/components/common';
import { FundSelect } from '../../features/finance/components/Selectors';

/** One account's running-balance register, oldest first, loaded page by page with a cursor. */
export default function AccountRegisterPage() {
  const id = Number(useParams().id);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [fundId, setFundId] = useState<number | null>(null);
  const [head, setHead] = useState<Register | null>(null);
  const [rows, setRows] = useState<RegisterRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async (after?: string) => {
    try {
      const page = await accountRegister(id, { from: from || undefined, to: to || undefined, fundId: fundId ?? undefined, limit: 50, cursor: after });
      if (!after) setHead(page);
      setRows((prev) => (after ? [...prev, ...page.data] : page.data));
      setCursor(page.nextCursor);
      setError(null);
    } catch (failure) {
      setError(normalizeError(failure));
    } finally {
      setLoading(false);
      setMore(false);
    }
  }, [id, from, to, fundId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  return (
    <div className="ui-page ui-stack">
      <PageHeader title={head ? `${head.account.code} · ${head.account.name}` : 'Account register'} subtitle={head ? `Opening balance ${head.openingBalance}` : undefined} crumbs={[{ label: 'Chart of accounts', to: '/finance/accounts' }]} />
      <FilterBar>
        <Field label="From">{(c) => <DateInput {...c} value={from} onChange={setFrom} />}</Field>
        <Field label="To">{(c) => <DateInput {...c} value={to} onChange={setTo} />}</Field>
        <Field label="Fund">{(c) => <FundSelect {...c} allowEmpty emptyLabel="All funds" value={fundId} onChange={setFundId} />}</Field>
      </FilterBar>
      <Card flush>
        <DataTable<RegisterRow>
          rowKey={(r) => r.lineId}
          rows={rows}
          loading={loading}
          error={error}
          onRetry={() => load()}
          columns={[
            { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
            { key: 'entry', header: 'Entry', render: (r) => <Link to={`/finance/journal/${r.entryId}`}>#{r.entryNo}</Link> },
            { key: 'memo', header: 'Description', render: (r) => r.memo ?? '' },
            { key: 'debit', header: 'Debit', numeric: true, render: (r) => (r.debit === '0.00' ? '' : <Money value={r.debit} />) },
            { key: 'credit', header: 'Credit', numeric: true, render: (r) => (r.credit === '0.00' ? '' : <Money value={r.credit} />) },
            { key: 'balance', header: 'Balance', numeric: true, render: (r) => <Money value={r.balance} strong /> }
          ]}
          empty={<span>No postings in this range.</span>}
          footer={<LoadMore shown={rows.length} hasMore={cursor !== null} loading={more} onMore={() => { setMore(true); void load(cursor!); }} noun="lines" />}
        />
      </Card>
    </div>
  );
}
