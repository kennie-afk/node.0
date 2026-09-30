import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, ErrorState, formatMoney, InlineConfirm, Input, monthLabel, PageHeader, PageLoader, StatusPill, sumMoney, useQuery, useToast } from '../../ui';
import { activateBudget, approveBudget, closeBudget, deleteBudget, getBudget, updateBudget, type BudgetLine } from '../../api/budgetsApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { AccountSelect, FundSelect } from '../../features/finance/components/Selectors';
import { useAccounts, useFunds } from '../../features/finance/components/lookups';
import { annualOf, splitAnnual } from '../../features/finance/budgetMath';

interface Row { key: number; accountId: number; fundId: number; label: string; fundCode: string; type: string; months: string[] }
let seq = 0;

/** The budget grid: one row per account and fund, twelve months across, totals that add up as you type. */
export default function BudgetEditorPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const { data: budget, error, refetch } = useQuery(() => getBudget(id), [id]);
  const accounts = useAccounts();
  const funds = useFunds();
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newAccount, setNewAccount] = useState<number | null>(null);
  const [newFund, setNewFund] = useState<number | null>(null);

  useEffect(() => {
    if (!budget) return;
    setRows(budget.lines.map((l: BudgetLine) => ({ key: ++seq, accountId: l.accountId, fundId: l.fundId, label: `${l.accountCode} · ${l.accountName}`, fundCode: l.fundCode, type: l.accountType, months: [...l.months] })));
    setDirty(false);
  }, [budget]);

  const editable = budget?.status === 'DRAFT' && can('finance:post');
  const colTotals = useMemo(() => Array.from({ length: 12 }, (_, m) => ({ income: sumMoney(rows.filter((r) => r.type === 'INCOME').map((r) => r.months[m])), expense: sumMoney(rows.filter((r) => r.type === 'EXPENSE').map((r) => r.months[m])) })), [rows]);

  if (error && !budget) return <div className="ui-page"><ErrorState message={error.message} onRetry={refetch} requestId={error.requestId} /></div>;
  if (!budget) return <PageLoader />;

  const setCell = (key: number, month: number, value: string) => { setRows((rs) => rs.map((r) => (r.key === key ? { ...r, months: r.months.map((m, i) => (i === month ? value : m)) } : r))); setDirty(true); };
  const addRow = () => {
    if (!newAccount || !newFund) return;
    const account = accounts.data?.find((a) => a.id === newAccount);
    const fund = funds.data?.find((f) => f.id === newFund);
    if (!account || !fund) return;
    if (rows.some((r) => r.accountId === newAccount && r.fundId === newFund)) { toast.error('That account and fund is already in the grid'); return; }
    setRows((rs) => [...rs, { key: ++seq, accountId: account.id, fundId: fund.id, label: `${account.code} · ${account.name}`, fundCode: fund.code, type: account.type, months: Array(12).fill('0.00') }]);
    setNewAccount(null); setDirty(true);
  };
  const save = async () => {
    setBusy(true);
    try {
      await updateBudget(id, { mode: 'replace', lines: rows.map((r) => ({ accountId: r.accountId, fundId: r.fundId, months: r.months.map((m) => m || '0.00') })) });
      toast.success('Budget saved');
      await refetch();
    } catch (f) { toast.error(normalizeError(f).message); } finally { setBusy(false); }
  };
  const act = async (work: () => Promise<unknown>, done: string) => { setBusy(true); try { await work(); toast.success(done); refetch(); } catch (f) { toast.error(normalizeError(f).message); } finally { setBusy(false); } };

  const income = sumMoney(colTotals.map((c) => c.income));
  const expense = sumMoney(colTotals.map((c) => c.expense));

  return (
    <div className="ui-page ui-stack">
      <PageHeader
        title={budget.name}
        crumbs={[{ label: 'Budgets', to: '/budgets' }]}
        actions={
          <div className="ui-row">
            <StatusPill status={budget.status} />
            <Button size="sm" to={`/budgets/${id}/variance`}>Actual vs budget</Button>
            {can('finance:post') && <Button size="sm" to={`/budgets/${id}/copy`}>Copy to another year</Button>}
            {budget.status === 'DRAFT' && can('finance:approve') && <Button size="sm" variant="primary" loading={busy} disabled={dirty} onClick={() => act(() => approveBudget(id), 'Budget approved')}>Approve</Button>}
            {budget.status === 'APPROVED' && can('finance:approve') && <Button size="sm" variant="primary" loading={busy} onClick={() => act(() => activateBudget(id), 'Budget is now active for the year')}>Make active</Button>}
            {budget.status === 'ACTIVE' && can('finance:approve') && <InlineConfirm label="Close budget" question="Close this budget?" variant="secondary" onConfirm={() => act(() => closeBudget(id), 'Budget closed')} />}
            {budget.status === 'DRAFT' && can('finance:post') && <InlineConfirm label="Delete" question="Delete this draft?" onConfirm={async () => { try { await deleteBudget(id); toast.success('Budget deleted'); navigate('/budgets'); } catch (f) { toast.error(normalizeError(f).message); } }} />}
          </div>
        }
      />
      {!editable && <p className="fin-muted">{budget.status === 'DRAFT' ? 'You can view but not edit this draft.' : `A ${budget.status.toLowerCase()} budget is read-only. Copy it to start next year’s.`}</p>}
      {editable && (
        <Card title="Add a line">
          <div className="ui-row" role="group" aria-label="Add a budget line">
            <div style={{ minWidth: 240 }}><AccountSelect aria-label="Account to budget" types={['INCOME', 'EXPENSE']} value={newAccount} onChange={setNewAccount} /></div>
            <div style={{ minWidth: 140 }}><FundSelect aria-label="Fund" value={newFund ?? funds.data?.[0]?.id ?? null} onChange={setNewFund} /></div>
            <Button size="sm" onClick={() => { if (!newFund && funds.data?.[0]) setNewFund(funds.data[0].id); addRow(); }} disabled={!newAccount}>Add to grid</Button>
          </div>
        </Card>
      )}
      <Card flush title={`${rows.length} lines`} actions={editable && <Button size="sm" variant="primary" loading={busy} disabled={!dirty} onClick={save}>{dirty ? 'Save changes' : 'Saved'}</Button>}>
        <div className="fin-scroll-x">
          <table className="fin-lines fin-grid-cells" aria-label="Budget grid">
            <thead>
              <tr><th>Account</th><th>Fund</th>{Array.from({ length: 12 }, (_, m) => <th key={m} style={{ textAlign: 'right' }}>{monthLabel(m + 1).slice(0, 3)}</th>)}<th style={{ textAlign: 'right' }}>Year</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td style={{ minWidth: 190 }}>{r.label}</td>
                  <td>{r.fundCode}</td>
                  {r.months.map((m, i) => (
                    <td key={i}>{editable ? <Input className="ui-num" aria-label={`${r.label} ${monthLabel(i + 1)}`} inputMode="decimal" value={m} onChange={(e) => setCell(r.key, i, e.target.value.replace(/[^0-9.]/g, ''))} onBlur={() => setCell(r.key, i, m ? formatMoney(m, { showCurrency: false }).replace(/,/g, '') : '0.00')} /> : <span className="ui-num">{formatMoney(m, { showCurrency: false })}</span>}</td>
                  ))}
                  <td className="ui-num"><strong>{formatMoney(annualOf(r.months), { showCurrency: false })}</strong></td>
                  <td>
                    {editable && (
                      <span className="ui-row">
                        <Button size="sm" variant="ghost" type="button" title="Spread the year total evenly" onClick={() => { setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, months: splitAnnual(annualOf(x.months)) } : x))); setDirty(true); }}>Even out</Button>
                        <Button size="sm" variant="ghost" type="button" onClick={() => { setRows((rs) => rs.filter((x) => x.key !== r.key)); setDirty(true); }}>Remove</Button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th colSpan={2}>Income</th>{colTotals.map((c, i) => <td key={i} className="ui-num">{formatMoney(c.income, { showCurrency: false })}</td>)}<td className="ui-num"><strong>{formatMoney(income, { showCurrency: false })}</strong></td><td /></tr>
              <tr><th colSpan={2}>Spending</th>{colTotals.map((c, i) => <td key={i} className="ui-num">{formatMoney(c.expense, { showCurrency: false })}</td>)}<td className="ui-num"><strong>{formatMoney(expense, { showCurrency: false })}</strong></td><td /></tr>
            </tfoot>
          </table>
        </div>
        {rows.length === 0 && <p className="fin-muted" style={{ padding: 12 }}>No lines yet. Add an income or expense account above, then enter what you expect each month. Or <Link to={`/budgets/${id}/copy`}>copy</Link> from another budget.</p>}
      </Card>
    </div>
  );
}
