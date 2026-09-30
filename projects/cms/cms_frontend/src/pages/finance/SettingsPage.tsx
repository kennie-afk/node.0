import { useState, type FormEvent } from 'react';
import { Button, Card, ErrorState, Field, Input, MoneyInput, PageHeader, PageLoader, Select, useQuery } from '../../ui';
import { getSettings, updateSettings, type FinanceSettings } from '../../api/financeApi';
import { FormError } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';
import { SectionTabs } from '../../features/finance/components/SectionTabs';
import { useAuth } from '../../context/auth-context';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function SettingsPage() {
  const { data, error, refetch } = useQuery(() => getSettings(), []);
  if (error && !data) return <div className="ui-page"><ErrorState message={error.message} onRetry={refetch} requestId={error.requestId} /></div>;
  if (!data) return <PageLoader />;
  return <SettingsForm key={JSON.stringify(data)} initial={data} onSaved={refetch} />;
}

function SettingsForm({ initial, onSaved }: { initial: FinanceSettings; onSaved: () => void }) {
  const { can } = useAuth();
  const submit = useSubmit();
  const editable = can('finance:settings');
  const [form, setForm] = useState<FinanceSettings>(initial);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await submit.run(() => updateSettings({ fiscalYearStartMonth: form.fiscalYearStartMonth, approvalThreshold: form.approvalThreshold, dualApprovalThreshold: form.dualApprovalThreshold, requireSeparationOfDuties: form.requireSeparationOfDuties, allowRestrictedOverspend: form.allowRestrictedOverspend, receiptPrefix: form.receiptPrefix } as never), 'Settings saved');
    onSaved();
  };
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Finance settings" />
      <SectionTabs section="ledger" active="/finance/settings" />
      <Card>
        <form className="ui-form" onSubmit={onSubmit}>
          <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0 }} className="ui-stack">
            <div className="ui-form-grid">
              <Field label="Currency">{(c) => <Input {...c} value={form.baseCurrency} disabled />}</Field>
              <Field label="Fiscal year starts" hint="Cannot change once anything is posted">{(c) => <Select {...c} value={form.fiscalYearStartMonth} onChange={(e) => set('fiscalYearStartMonth', Number(e.target.value))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</Select>}</Field>
              <Field label="Receipt prefix">{(c) => <Input {...c} value={form.receiptPrefix} maxLength={10} onChange={(e) => set('receiptPrefix', e.target.value.toUpperCase())} />}</Field>
              <Field label="Auto-approve bills below" hint="0 means every bill needs an approver">{(c) => <MoneyInput {...c} value={form.approvalThreshold} onChange={(v) => set('approvalThreshold', v)} />}</Field>
              <Field label="Two approvers at or above" hint="Dual control for large bills">{(c) => <MoneyInput {...c} value={form.dualApprovalThreshold} onChange={(v) => set('dualApprovalThreshold', v)} />}</Field>
            </div>
            <label className="ui-row"><input type="checkbox" checked={form.requireSeparationOfDuties} onChange={(e) => set('requireSeparationOfDuties', e.target.checked)} /> The person who prepares a bill, batch or pay run cannot approve it</label>
            <label className="ui-row"><input type="checkbox" checked={form.allowRestrictedOverspend} onChange={(e) => set('allowRestrictedOverspend', e.target.checked)} /> Allow restricted funds to go negative (not recommended)</label>
          </fieldset>
          {!form.requireSeparationOfDuties && <p className="fin-warn">Separation of duties is off. One person can now prepare and approve. Changes are written to the audit trail.</p>}
          <FormError error={submit.error} />
          {editable ? <div className="ui-form-actions"><Button type="submit" variant="primary" loading={submit.loading}>Save settings</Button></div> : <p className="fin-muted">Only an administrator can change these settings.</p>}
        </form>
      </Card>
    </div>
  );
}
