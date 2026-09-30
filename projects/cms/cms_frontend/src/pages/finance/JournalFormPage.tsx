import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, DateInput, Field, formatMoney, fromMinor, Input, MoneyInput, PageHeader, todayISO } from '../../ui';
import { postJournal } from '../../api/financeApi';
import { AccountSelect, FundSelect } from '../../features/finance/components/Selectors';
import { FormError } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';
import { useFunds } from '../../features/finance/components/lookups';
import { blankLine, checkEntry, type DraftLine } from '../../features/finance/journalMath';

/** A manual double-entry journal. The balance strip shows, as you type, exactly what the ledger will check. */
export default function JournalFormPage() {
  const navigate = useNavigate();
  const submit = useSubmit();
  const funds = useFunds();
  const defaultFund = funds.data?.find((f) => f.restriction === 'UNRESTRICTED')?.id ?? funds.data?.[0]?.id ?? null;
  const [date, setDate] = useState(todayISO());
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState<DraftLine[]>(() => [blankLine(), blankLine()]);
  const patch = (key: number, change: Partial<DraftLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...change } : l)));
  const effective = lines.map((l) => ({ ...l, fundId: l.fundId ?? defaultFund }));
  const check = checkEntry(effective);
  const fundName = (id: number | null) => funds.data?.find((f) => f.id === id)?.code ?? '?';

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const used = effective.filter((l) => l.accountId || l.debit || l.credit);
    const entry = await submit.run(
      (key) => postJournal({ date, memo, lines: used.map((l) => ({ accountId: l.accountId!, fundId: l.fundId!, debit: l.debit || undefined, credit: l.credit || undefined, memo: l.memo || null })) }, key),
      'Entry posted'
    );
    if (entry) navigate(`/finance/journal/${entry.id}`);
  };

  return (
    <div className="ui-page ui-stack">
      <PageHeader title="New journal entry" subtitle="For anything that does not arrive from giving, bills or payroll" crumbs={[{ label: 'Journal', to: '/finance/journal' }]} />
      <form className="ui-stack" onSubmit={onSubmit} aria-label="New journal entry">
        <Card>
          <div className="ui-form-grid">
            <Field label="Date" required>{(c) => <DateInput {...c} value={date} onChange={setDate} />}</Field>
            <Field label="Description" required>{(c) => <Input {...c} value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={500} placeholder="What is this entry for?" />}</Field>
          </div>
        </Card>
        <Card title="Lines" flush>
          <div className="fin-scroll-x">
            <table className="fin-lines">
              <thead><tr><th>Account</th><th>Fund</th><th>Debit</th><th>Credit</th><th>Note</th><th /></tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.key}>
                    <td style={{ minWidth: 200 }}><AccountSelect aria-label={`Line ${i + 1} account`} value={l.accountId} onChange={(v) => patch(l.key, { accountId: v })} /></td>
                    <td style={{ minWidth: 120 }}><FundSelect aria-label={`Line ${i + 1} fund`} value={l.fundId ?? defaultFund} onChange={(v) => patch(l.key, { fundId: v })} /></td>
                    <td><MoneyInput aria-label={`Line ${i + 1} debit`} value={l.debit} onChange={(v) => patch(l.key, { debit: v, credit: v ? '' : l.credit })} /></td>
                    <td><MoneyInput aria-label={`Line ${i + 1} credit`} value={l.credit} onChange={(v) => patch(l.key, { credit: v, debit: v ? '' : l.debit })} /></td>
                    <td><Input aria-label={`Line ${i + 1} note`} value={l.memo} onChange={(e) => patch(l.key, { memo: e.target.value })} maxLength={255} /></td>
                    <td>{lines.length > 2 && <Button size="sm" variant="ghost" type="button" aria-label={`Remove line ${i + 1}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>Remove</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: 8 }}><Button type="button" size="sm" onClick={() => setLines((ls) => [...ls, blankLine()])}>Add a line</Button></div>
        </Card>
        <Card title="Balance">
          <div className="fin-balance" role="status" aria-live="polite">
            <span>Debits <strong className="ui-num">{formatMoney(fromMinor(check.debit))}</strong></span>
            <span>Credits <strong className="ui-num">{formatMoney(fromMinor(check.credit))}</strong></span>
            <span className={check.difference === 0 && check.debit > 0 ? 'ok' : 'bad'}>{check.difference === 0 ? (check.debit > 0 ? 'Balanced' : 'Nothing entered') : `Out by ${fromMinor(Math.abs(check.difference))}`}</span>
            {check.perFund.map((f) => <span key={String(f.fundId)} className={f.difference === 0 ? 'ok' : 'bad'}>{fundName(f.fundId)}: {f.difference === 0 ? 'balanced' : `out by ${fromMinor(Math.abs(f.difference))}`}</span>)}
          </div>
          {check.problems.length > 0 && check.debit + check.credit > 0 && <ul className="fin-muted" style={{ margin: 0, paddingLeft: 16 }}>{check.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        </Card>
        <FormError error={submit.error} />
        <div className="ui-form-actions"><Button type="submit" variant="primary" loading={submit.loading} disabled={!check.balanced || !memo.trim()}>Post entry</Button><Button to="/finance/journal" variant="ghost">Cancel</Button></div>
      </form>
    </div>
  );
}
