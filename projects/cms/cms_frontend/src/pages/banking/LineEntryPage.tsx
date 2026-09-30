import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Field, Input, PageHeader } from '../../ui';
import { createEntryFromLine } from '../../api/bankingApi';
import { AccountSelect, FundSelect } from '../../features/finance/components/Selectors';
import { FormError } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';

/** Books a bank line that has no ledger entry yet (bank charges, interest) and matches it in one step. */
export default function LineEntryPage() {
  const lineId = Number(useParams().id);
  const navigate = useNavigate();
  const submit = useSubmit();
  const [accountId, setAccountId] = useState<number | null>(null);
  const [fundId, setFundId] = useState<number | null>(null);
  const [memo, setMemo] = useState('');
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const done = await submit.run(() => createEntryFromLine(lineId, { accountId: accountId!, fundId: fundId!, memo: memo || null }), 'Entry created and matched');
    if (done) navigate(-1);
  };
  return (
    <div className="ui-page ui-stack">
      <PageHeader title={`Create an entry for bank line #${lineId}`} subtitle="The other side of the entry is the bank account the line came from" />
      <Card>
        <form className="ui-form" onSubmit={onSubmit}>
          <div className="ui-form-grid">
            <Field label="Account to book it to" required hint="e.g. Bank and M-Pesa Charges for a fee">{(c) => <AccountSelect {...c} value={accountId} onChange={setAccountId} />}</Field>
            <Field label="Fund" required>{(c) => <FundSelect {...c} value={fundId} onChange={setFundId} />}</Field>
            <Field label="Description">{(c) => <Input {...c} value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={500} />}</Field>
          </div>
          <FormError error={submit.error} />
          <div className="ui-form-actions"><Button type="submit" variant="primary" loading={submit.loading} disabled={!accountId || !fundId}>Create and match</Button><Button type="button" variant="ghost" onClick={() => navigate(-1)}>Cancel</Button></div>
        </form>
      </Card>
    </div>
  );
}
