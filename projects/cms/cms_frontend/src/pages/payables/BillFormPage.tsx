import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, DateInput, Field, formatMoney, fromMinor, Input, MoneyInput, PageHeader, Select, toMinor, todayISO, useQuery } from '../../ui';
import { checkBudget } from '../../api/budgetsApi';
import { createBill, createExpenseClaim, getBill, listVendors, updateBill } from '../../api/payablesApi';
import { AccountSelect, FundSelect, MinistrySelect } from '../../features/finance/components/Selectors';
import { FormError } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';
import { useFunds } from '../../features/finance/components/lookups';

interface LineDraft { key: number; accountId: number | null; fundId: number | null; ministryId: number | null; description: string; amount: string }
let seq = 0;
const blank = (fundId: number | null): LineDraft => ({ key: ++seq, accountId: null, fundId, ministryId: null, description: '', amount: '' });

/** New bill, new expense claim, or edit a draft. The same form; a claim just pays a staff member. */
export default function BillFormPage() {
  const idParam = useParams().id;
  const id = idParam ? Number(idParam) : null;
  const isClaim = useLocation().pathname.includes('/claims/');
  const navigate = useNavigate();
  const submit = useSubmit();
  const funds = useFunds();
  const defaultFund = funds.data?.find((f) => f.restriction === 'UNRESTRICTED')?.id ?? funds.data?.[0]?.id ?? null;
  const vendors = useQuery(() => listVendors({ kind: isClaim ? 'STAFF' : undefined, active: true }), [isClaim]);
  const [vendorId, setVendorId] = useState('');
  const [reference, setReference] = useState('');
  const [billDate, setBillDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(todayISO());
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState<LineDraft[]>(() => [blank(null)]);

  useEffect(() => {
    if (!id) return;
    getBill(id).then((b) => {
      setVendorId(String(b.vendorId)); setReference(b.reference ?? ''); setBillDate(b.billDate); setDueDate(b.dueDate); setMemo(b.memo ?? '');
      setLines(b.lines.map((l) => ({ key: ++seq, accountId: l.accountId, fundId: l.fundId, ministryId: l.ministryId, description: l.description ?? '', amount: l.amount })));
    });
  }, [id]);

  // Ask the server whether each filled-in line fits the remaining budget while the form is being typed,
  // so the warning arrives before submission rather than after. Advisory only: it never blocks saving.
  const [budgetWarnings, setBudgetWarnings] = useState<Record<number, string>>({});
  const checkKey = JSON.stringify(lines.map((l) => [l.key, l.accountId, l.fundId ?? defaultFund, l.amount])) + billDate;
  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(async () => {
      const next: Record<number, string> = {};
      for (const l of lines) {
        const fundId = l.fundId ?? defaultFund;
        if (!l.accountId || !fundId || !l.amount || toMinor(l.amount) <= 0) continue;
        try {
          const result = await checkBudget({ accountId: l.accountId, fundId, amount: l.amount, date: billDate });
          if (result.hasBudget && result.warning) next[l.key] = result.warning;
        } catch {
          // The check is a courtesy: if it cannot be answered the form still works.
        }
      }
      if (live) setBudgetWarnings(next);
    }, 500);
    return () => { live = false; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkKey]);

  const patch = (key: number, change: Partial<LineDraft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...change } : l)));
  const total = lines.reduce((s, l) => s + (l.amount ? toMinor(l.amount) : 0), 0);
  const valid = vendorId && lines.every((l) => l.accountId && (l.fundId ?? defaultFund) && l.amount && toMinor(l.amount) > 0);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { vendorId: Number(vendorId), reference: reference || null, billDate, dueDate, memo: memo || null, lines: lines.map((l) => ({ accountId: l.accountId!, fundId: (l.fundId ?? defaultFund)!, ministryId: l.ministryId, description: l.description || null, amount: l.amount })) };
    const saved = await submit.run(() => (id ? updateBill(id, body) : isClaim ? createExpenseClaim(body) : createBill(body)), 'Saved as a draft');
    if (saved) navigate(`/payables/bills/${saved.id}`);
  };

  return (
    <div className="ui-page ui-stack">
      <PageHeader title={id ? 'Edit draft bill' : isClaim ? 'New expense claim' : 'New bill'} subtitle={isClaim ? 'A refund owed to a staff member for money they spent' : 'Saved as a draft; submit it for approval from the bill page'} crumbs={[{ label: 'Bills', to: '/payables/bills' }]} />
      <form className="ui-stack" onSubmit={onSubmit}>
        <Card>
          <div className="ui-form-grid">
            <Field label={isClaim ? 'Staff member' : 'Vendor'} required hint={isClaim ? 'Add the person as a vendor of kind Staff first' : undefined}>
              {(c) => <Select {...c} value={vendorId} onChange={(e) => setVendorId(e.target.value)}><option value="">Choose…</option>{(vendors.data?.data ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>}
            </Field>
            <Field label="Invoice / reference">{(c) => <Input {...c} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} />}</Field>
            <Field label="Bill date" required>{(c) => <DateInput {...c} value={billDate} onChange={setBillDate} />}</Field>
            <Field label="Due date" required>{(c) => <DateInput {...c} value={dueDate} onChange={setDueDate} />}</Field>
            <Field label="Note">{(c) => <Input {...c} value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={500} />}</Field>
          </div>
        </Card>
        <Card title="What it was for" flush>
          <div className="fin-scroll-x">
            <table className="fin-lines">
              <thead><tr><th>Expense account</th><th>Fund</th><th>Ministry</th><th>Description</th><th>Amount</th><th /></tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.key}>
                    <td style={{ minWidth: 190 }}><AccountSelect aria-label={`Line ${i + 1} account`} types={['EXPENSE', 'ASSET']} value={l.accountId} onChange={(v) => patch(l.key, { accountId: v })} /></td>
                    <td><FundSelect aria-label={`Line ${i + 1} fund`} value={l.fundId ?? defaultFund} onChange={(v) => patch(l.key, { fundId: v })} /></td>
                    <td><MinistrySelect aria-label={`Line ${i + 1} ministry`} value={l.ministryId} onChange={(v) => patch(l.key, { ministryId: v })} /></td>
                    <td><Input aria-label={`Line ${i + 1} description`} value={l.description} onChange={(e) => patch(l.key, { description: e.target.value })} maxLength={255} /></td>
                    <td><MoneyInput aria-label={`Line ${i + 1} amount`} value={l.amount} onChange={(v) => patch(l.key, { amount: v })} /></td>
                    <td>{lines.length > 1 && <Button size="sm" type="button" variant="ghost" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>Remove</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lines.some((l) => budgetWarnings[l.key]) && (
            <div className="fin-warn" role="status" style={{ margin: 8 }}>
              {lines.map((l, i) => budgetWarnings[l.key] && <div key={l.key}>Line {i + 1}: {budgetWarnings[l.key]}</div>)}
            </div>
          )}
          <div className="ui-row" style={{ padding: 8, justifyContent: 'space-between' }}>
            <Button type="button" size="sm" onClick={() => setLines((ls) => [...ls, blank(null)])}>Add a line</Button>
            <strong className="ui-num">Total {formatMoney(fromMinor(total))}</strong>
          </div>
        </Card>
        <FormError error={submit.error} />
        <div className="ui-form-actions"><Button type="submit" variant="primary" loading={submit.loading} disabled={!valid}>Save draft</Button><Button to="/payables/bills" variant="ghost">Cancel</Button></div>
      </form>
    </div>
  );
}
