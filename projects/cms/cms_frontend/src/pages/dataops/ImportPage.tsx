import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { Badge, Button, Card, DataTable, Field, PageHeader, StatTile, Textarea, useToast, type Column } from '../../ui';
import { importMembers, type ImportResult } from '../../api/dataopsApi';
import { normalizeError } from '../../api/http';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { Notice } from '../../features/ops/components/FormBanner';
import { canApply, errorsByRow, summarise } from '../../features/ops/lib/importing';
import { DataTabs } from './DataTabs';

const TEMPLATE = 'first_name,last_name,email,phone_number,gender,date_of_birth,membership_date,city\nJane,Wanjiru,jane@example.org,0712345678,Female,1990-04-12,2024-01-07,Nairobi\n';
const MAX_BYTES = 900_000;

type Step = 'input' | 'review' | 'done';

export default function ImportPage() {
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [updateExisting, setUpdateExisting] = useState(false);
  const [allowPartial, setAllowPartial] = useState(false);
  const [step, setStep] = useState<Step>('input');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const tooBig = new Blob([csv]).size > MAX_BYTES;
  const rows = csv.trim() ? csv.trim().split(/\r?\n/).length - 1 : 0;

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      toast.error('That file is over 900 KB. Split it into smaller files of up to 5,000 rows.');
      return;
    }
    setCsv(await f.text());
    setFileName(f.name);
  };

  const run = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const r = await importMembers({ csv, dryRun, updateExisting, allowPartial });
      setResult(r);
      setStep(dryRun ? 'review' : 'done');
      if (!dryRun) toast.success(r.replayed ? 'This exact file was already imported; nothing changed.' : 'Import finished.');
    } catch (failure) {
      toast.error(normalizeError(failure).message);
    } finally {
      setBusy(false);
    }
  };

  const problemRows = result ? errorsByRow(result.errors) : [];
  const columns: Array<Column<{ row: number; problems: string[] }>> = [
    { key: 'row', header: 'Line', numeric: true, render: (r) => r.row },
    { key: 'problems', header: 'What to fix', render: (r) => r.problems.join('; ') }
  ];

  return (
    <OpsPage>
      <PageHeader title="Import members" subtitle="Bring a spreadsheet in safely. Always checked first; nothing is saved until you confirm." />
      <DataTabs active="import" />
      {step === 'input' && (
        <div className="ops-split">
          <div className="ui-stack">
            <Card title="1. Choose your file">
              <div className="ui-stack">
                <div className="ui-row">
                  <input ref={file} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => void onFile(e.target.files?.[0])} aria-label="CSV file" />
                  <Button variant="secondary" icon={<Upload size={12} aria-hidden />} onClick={() => file.current?.click()}>Choose a CSV file</Button>
                  {fileName && <span className="ops-muted">{fileName}</span>}
                </div>
                <Field label="Or paste the rows" hint={`${rows} data row${rows === 1 ? '' : 's'}. The first line must be the column headings. Up to 5,000 rows and 900 KB per import.`} error={tooBig ? 'This is over 900 KB. Split it into smaller files.' : undefined}>
                  {(c) => <Textarea {...c} rows={10} className="ops-mono" value={csv} onChange={(e) => { setCsv(e.target.value); setFileName(''); }} placeholder={TEMPLATE} />}
                </Field>
                <Button variant="ghost" size="sm" onClick={() => { setCsv(TEMPLATE); setFileName('example'); }}>Fill in an example</Button>
              </div>
            </Card>
            <Card title="2. Options">
              <div className="ui-stack">
                <label className="ops-check"><input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} /> Update members who are already on the list (matched by phone or email)</label>
                <label className="ops-check"><input type="checkbox" checked={allowPartial} onChange={(e) => setAllowPartial(e.target.checked)} /> Import the good rows even if some rows have errors</label>
              </div>
            </Card>
            <div><Button variant="primary" loading={busy} disabled={csv.trim().length < 10 || tooBig} onClick={() => run(true)}>Check the file</Button></div>
          </div>
          <Card title="Columns it understands"><p className="ops-muted" style={{ margin: 0 }}>first_name, last_name (both required); email, phone_number, gender (Male, Female, Other), date_of_birth, membership_date (YYYY-MM-DD), address, city, county, postal_code. Phone numbers are tidied to +254 form. A row matching an existing phone or email is skipped unless you chose to update.</p></Card>
        </div>
      )}
      {step === 'review' && result && (
        <div className="ui-stack">
          <Notice tone={result.errorCount > 0 ? 'warn' : 'ok'} title="Checked, nothing saved yet">{summarise(result)}.</Notice>
          <div className="ui-grid" style={{ ['--ui-min' as string]: '110px' }}>
            <StatTile label="Will be added" value={result.createdCount} tone="ok" />
            <StatTile label="Will be updated" value={result.updatedCount} />
            <StatTile label="Skipped" value={result.skippedCount} foot="Already on the list" />
            <StatTile label="Problems" value={result.errorCount} tone={result.errorCount ? 'bad' : undefined} />
          </div>
          {problemRows.length > 0 && <Card title="Rows with problems" flush><DataTable columns={columns} rows={problemRows} rowKey={(r) => r.row} /></Card>}
          {(result.preview ?? []).length > 0 && (
            <Card title="What will happen (first rows)"><ul className="ops-list">{(result.preview ?? []).slice(0, 20).map((p) => <li key={p.row}><span>Line {p.row}: {p.name}</span><Badge tone={p.action === 'CREATE' ? 'ok' : p.action === 'UPDATE' ? 'info' : 'neutral'}>{p.action.toLowerCase()}</Badge></li>)}</ul></Card>
          )}
          {result.errorCount > 0 && (
            <div className="ui-stack">
              {!allowPartial && <Notice tone="warn">Fix the lines above and check again, or choose to import just the good rows.</Notice>}
              <label className="ops-check"><input type="checkbox" checked={allowPartial} onChange={(e) => setAllowPartial(e.target.checked)} /> Import the good rows even if some rows have errors</label>
            </div>
          )}
          <div className="ui-form-actions">
            <Button variant="primary" loading={busy} disabled={!canApply(result, allowPartial)} onClick={() => run(false)}>{allowPartial && result.errorCount > 0 ? `Import ${result.createdCount + result.updatedCount} good rows` : 'Import now'}</Button>
            <Button variant="ghost" onClick={() => setStep('input')}>Back and edit</Button>
          </div>
        </div>
      )}
      {step === 'done' && result && (
        <div className="ui-stack">
          <Notice tone="ok" title={result.replayed ? 'Already imported' : 'Imported'}>{summarise(result)}.</Notice>
          <div className="ui-form-actions"><Button to="/members" variant="primary">See the members</Button><Button to="/data/imports" variant="secondary">Import history</Button><Button variant="ghost" onClick={() => { setStep('input'); setResult(null); setCsv(''); setFileName(''); }}>Import another file</Button></div>
          <Link to="/data/exports" className="ops-muted">Need a copy of the list? Export it.</Link>
        </div>
      )}
    </OpsPage>
  );
}
