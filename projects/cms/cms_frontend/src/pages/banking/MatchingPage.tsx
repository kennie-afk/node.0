import { Fragment, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Card, DataTable, formatDate, LoadMore, PageHeader, StatusPill, Tabs, useKeysetList, useQuery, useToast } from '../../ui';
import { autoMatch, ignoreLine, lineCandidates, listBankAccounts, matchLine, unignoreLine, unmatchLine, type LedgerCandidate, type MatchProposal, type StatementLine } from '../../api/bankingApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { Money, ReasonAction } from '../../features/finance/components/common';

const TABS = [{ key: 'UNMATCHED', label: 'Unmatched' }, { key: 'MATCHED', label: 'Matched' }, { key: 'IGNORED', label: 'Ignored' }, { key: 'RECONCILED', label: 'Reconciled' }];

/** Bank lines on the left of every decision, ledger candidates under the line being worked. */
export default function MatchingPage() {
  const id = Number(useParams().id);
  const { can } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState('UNMATCHED');
  const accounts = useQuery(() => listBankAccounts(true), []);
  const list = useKeysetList<StatementLine>(`/banking/accounts/${id}/lines`, { status });
  const [open, setOpen] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<LedgerCandidate[] | null>(null);
  const [proposals, setProposals] = useState<MatchProposal[] | null>(null);
  const [busy, setBusy] = useState(false);
  const write = can('finance:post');
  const name = accounts.data?.find((a) => a.id === id)?.name ?? 'Account';

  const act = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await work(); toast.success(done); list.refresh(); setOpen(null); setCandidates(null); setProposals(null); } catch (f) { toast.error(normalizeError(f).message); } finally { setBusy(false); }
  };
  const find = async (line: StatementLine) => {
    setOpen(line.id); setCandidates(null);
    try { setCandidates(await lineCandidates(line.id)); } catch (f) { toast.error(normalizeError(f).message); }
  };
  const preview = async () => {
    setBusy(true);
    try { setProposals((await autoMatch(id, { apply: false })).proposals); } catch (f) { toast.error(normalizeError(f).message); } finally { setBusy(false); }
  };

  return (
    <div className="ui-page ui-stack">
      <PageHeader
        title={`Match transactions · ${name}`}
        crumbs={[{ label: 'Accounts', to: '/banking/accounts' }, { label: name, to: `/banking/accounts/${id}` }]}
        actions={write && (
          <div className="ui-row">
            <Button size="sm" loading={busy} onClick={preview}>Preview auto-match</Button>
            {proposals && proposals.length > 0 && <Button size="sm" variant="primary" loading={busy} onClick={() => act(() => autoMatch(id, { apply: true }), 'Matches applied')}>Apply {proposals.filter((p) => p.unique).length} certain matches</Button>}
            <Button size="sm" to={`/banking/accounts/${id}/import`}>Import</Button>
          </div>
        )}
      />
      {proposals && (
        <Card title="Auto-match preview">
          {proposals.length === 0 ? <p className="fin-muted">Nothing to propose: no unmatched bank line has a ledger line with the same amount close in date.</p> : (
            <DataTable rowKey={(p) => p.lineId} rows={proposals} columns={[
              { key: 'line', header: 'Bank line', render: (p) => `#${p.lineId}` },
              { key: 'ledger', header: 'Ledger line', render: (p) => `#${p.journalLineId}` },
              { key: 'score', header: 'Confidence', numeric: true, render: (p) => `${p.score}%` },
              { key: 'unique', header: 'Certainty', render: (p) => <StatusPill status={p.unique ? 'Only candidate' : 'Several candidates'} tone={p.unique ? 'ok' : 'warn'} /> }
            ]} />
          )}
        </Card>
      )}
      <Tabs tabs={TABS} active={status} onChange={setStatus} label="Line status" />
      <DataTable<StatementLine>
        rowKey={(l) => l.id}
        rows={list.items}
        loading={list.loading}
        error={list.error}
        onRetry={list.refresh}
        columns={[
          { key: 'date', header: 'Date', render: (l) => formatDate(l.date) },
          { key: 'desc', header: 'Description', render: (l) => l.description },
          { key: 'ref', header: 'Reference', render: (l) => l.reference ?? '-' },
          { key: 'amt', header: 'Amount', numeric: true, render: (l) => <Money value={l.amount} strong /> },
          { key: 'status', header: 'Status', render: (l) => <StatusPill status={l.status} /> },
          {
            key: 'act', header: '',
            render: (l) => write && (
              <span className="ui-row">
                {l.status === 'UNMATCHED' && (
                  <>
                    <Button size="sm" onClick={() => find(l)}>Find matches</Button>
                    <Button size="sm" variant="ghost" to={`/banking/lines/${l.id}/create-entry`}>Create entry</Button>
                    <ReasonAction label="Ignore" variant="secondary" question="Why ignore this line?" confirmLabel="Ignore" onConfirm={(reason) => act(() => ignoreLine(l.id, reason), 'Line ignored')} />
                  </>
                )}
                {l.status === 'MATCHED' && <Button size="sm" variant="ghost" onClick={() => act(() => unmatchLine(l.id), 'Match removed')}>Unmatch</Button>}
                {l.status === 'IGNORED' && <Button size="sm" variant="ghost" onClick={() => act(() => unignoreLine(l.id), 'Line restored')}>Restore</Button>}
              </span>
            )
          }
        ]}
        empty={<span>{status === 'UNMATCHED' ? 'Every bank line is matched.' : 'No lines here.'}</span>}
        footer={<LoadMore shown={list.items.length} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} noun="lines" />}
      />
      {open !== null && (
        <Card title={`Ledger candidates for bank line #${open}`} actions={<Button size="sm" variant="ghost" onClick={() => setOpen(null)}>Close</Button>} flush>
          <DataTable<LedgerCandidate>
            rowKey={(c) => c.journalLineId}
            rows={candidates ?? []}
            loading={candidates === null}
            columns={[
              { key: 'date', header: 'Date', render: (c) => formatDate(c.date) },
              { key: 'entry', header: 'Entry', render: (c) => <Fragment><Link to={`/finance/journal/${c.entryId}`}>#{c.entryNo}</Link> {c.memo}</Fragment> },
              { key: 'src', header: 'Source', render: (c) => c.sourceType.toLowerCase().replace(/_/g, ' ') },
              { key: 'amt', header: 'Amount', numeric: true, render: (c) => <Money value={c.amount} /> },
              { key: 'score', header: 'Fit', numeric: true, render: (c) => (c.score === undefined ? '' : `${c.score}%`) },
              { key: 'act', header: '', render: (c) => <Button size="sm" variant="primary" loading={busy} onClick={() => act(() => matchLine(open, [c.journalLineId]), 'Matched')}>Match</Button> }
            ]}
            empty={<span>No ledger line has this amount near this date. Create an entry for it, or import the missing ledger activity.</span>}
          />
        </Card>
      )}
    </div>
  );
}
