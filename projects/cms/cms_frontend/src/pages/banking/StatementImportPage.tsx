import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, DateInput, Field, Input, MoneyInput, PageHeader, Textarea } from '../../ui';
import { importStatement } from '../../api/bankingApi';
import { FormError } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';

const SAMPLE = 'Date,Description,Reference,Amount\n2026-09-01,Transfer in,TRF100,25000.00\n2026-09-02,Bank charges,CHG9,-350.00\n';

/** Paste or upload a bank CSV. The server validates every row and refuses the whole file if any row is bad. */
export default function StatementImportPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const submit = useSubmit();
  const file = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState('');
  const [label, setLabel] = useState('');
  const [opening, setOpening] = useState('');
  const [closing, setClosing] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setCsv(await f.text());
      if (!label) setLabel(f.name.replace(/\.[^.]+$/, ''));
    }
  };
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const done = await submit.run((key) => importStatement(id, { label: label || null, periodStart: start || null, periodEnd: end || null, openingBalance: opening || null, closingBalance: closing || null, csv }, key), 'Statement imported');
    if (done) navigate(`/banking/accounts/${id}/match`);
  };
  const rows = csv.trim() ? csv.trim().split(/\r?\n/).length - 1 : 0;
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Import a bank statement" subtitle="Columns: Date, Description, Reference, Amount (negative for money out)" crumbs={[{ label: 'Accounts', to: '/banking/accounts' }, { label: 'Account', to: `/banking/accounts/${id}` }]} />
      <Card>
        <form className="ui-form" onSubmit={onSubmit} aria-label="Import a statement">
          <div className="ui-form-grid">
            <Field label="Label">{(c) => <Input {...c} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. September statement" maxLength={120} />}</Field>
            <Field label="Period from">{(c) => <DateInput {...c} value={start} onChange={setStart} />}</Field>
            <Field label="Period to">{(c) => <DateInput {...c} value={end} onChange={setEnd} />}</Field>
            <Field label="Opening balance">{(c) => <MoneyInput {...c} value={opening} onChange={setOpening} />}</Field>
            <Field label="Closing balance">{(c) => <MoneyInput {...c} value={closing} onChange={setClosing} />}</Field>
          </div>
          <Field label={`Statement CSV${rows ? ` (${rows} rows)` : ''}`} required hint="Paste the rows, or upload the file the bank gave you">
            {(c) => <Textarea {...c} rows={10} className="fin-pre" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={SAMPLE} />}
          </Field>
          <div className="ui-row">
            <input ref={file} type="file" accept=".csv,text/csv,text/plain" onChange={onFile} aria-label="Upload a CSV file" />
            <Button type="button" size="sm" variant="ghost" onClick={() => setCsv(SAMPLE)}>Use an example</Button>
          </div>
          <FormError error={submit.error} />
          <div className="ui-form-actions"><Button type="submit" variant="primary" loading={submit.loading} disabled={!csv.trim()}>Import</Button><Button to={`/banking/accounts/${id}`} variant="ghost">Cancel</Button></div>
        </form>
      </Card>
    </div>
  );
}
