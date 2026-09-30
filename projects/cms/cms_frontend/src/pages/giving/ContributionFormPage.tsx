import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, DateInput, Field, Input, MoneyInput, PageHeader, Select, Textarea, todayISO, type ComboOption } from '../../ui';
import { recordGift } from '../../api/givingApi';
import { FormError } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';
import { PAYMENT_METHODS } from '../../features/finance/components/helpers';
import { BankAccountSelect, FundSelect, GivingTypeSelect, MemberPicker } from '../../features/finance/components/Selectors';
import { memberOption } from '../../features/finance/components/selectorHelpers';
import { useGivingTypes } from '../../features/finance/components/lookups';

export default function ContributionFormPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const types = useGivingTypes();
  const submit = useSubmit();
  const [member, setMember] = useState<ComboOption<number> | null>(null);
  const [contributorName, setContributorName] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [typeId, setTypeId] = useState<number | null>(null);
  const [fundId, setFundId] = useState<number | null>(null);
  const [method, setMethod] = useState('Cash');
  const [reference, setReference] = useState('');
  const [depositId, setDepositId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const pledgeId = params.get('pledgeId');
  const campaignId = params.get('campaignId');

  useEffect(() => {
    const id = params.get('memberId');
    if (id) memberOption(Number(id)).then(setMember).catch(() => undefined);
  }, [params]);

  const pickedType = types.data?.find((t) => t.id === typeId);
  const effectiveFund = fundId ?? pickedType?.defaultFundId ?? null;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const gift = await submit.run(
      (key) =>
        recordGift(
          {
            memberId: member?.value ?? null,
            contributorName: member ? null : contributorName || null,
            amount,
            date,
            givingTypeId: typeId ?? undefined,
            fundId: effectiveFund ?? undefined,
            paymentMethod: method,
            transactionId: reference || null,
            notes: notes || null,
            depositAccountId: depositId ?? undefined,
            pledgeId: pledgeId ? Number(pledgeId) : undefined,
            campaignId: campaignId ? Number(campaignId) : undefined,
            isAnonymous: anonymous
          },
          key
        ),
      'Gift recorded and posted to the ledger'
    );
    if (gift) navigate(`/giving/contributions/${gift.id}`);
  };

  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Record a gift" crumbs={[{ label: 'Gifts', to: '/giving/contributions' }]} />
      <Card>
        <form className="ui-form" onSubmit={onSubmit} aria-label="Record a gift">
          <div className="ui-form-grid">
            <Field label="Member" hint="Leave empty for a visitor or an unnamed plate offering">
              {(c) => <MemberPicker {...c} value={member} onChange={setMember} />}
            </Field>
            {!member && <Field label="Donor name" hint="For someone who is not a member">{(c) => <Input {...c} value={contributorName} onChange={(e) => setContributorName(e.target.value)} maxLength={255} />}</Field>}
            <Field label="Amount" required error={submit.error?.fieldMessage('amount')}>{(c) => <MoneyInput {...c} value={amount} onChange={setAmount} />}</Field>
            <Field label="Date" required>{(c) => <DateInput {...c} value={date} onChange={setDate} />}</Field>
            <Field label="Giving type" hint="Decides the income account">{(c) => <GivingTypeSelect {...c} value={typeId} onChange={setTypeId} />}</Field>
            <Field label="Fund" hint={pickedType ? 'Defaults to the type’s fund' : undefined}>{(c) => <FundSelect {...c} value={effectiveFund} onChange={setFundId} />}</Field>
            <Field label="Payment method">
              {(c) => (
                <Select {...c} value={method} onChange={(e) => setMethod(e.target.value)}>
                  {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Reference" hint="M-Pesa code, cheque number…">{(c) => <Input {...c} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={255} />}</Field>
            <Field label="Deposit into" hint="Defaults from the payment method">{(c) => <BankAccountSelect {...c} allowEmpty emptyLabel="Automatic" value={depositId} onChange={setDepositId} />}</Field>
            <Field label="Notes">{(c) => <Textarea {...c} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />}</Field>
          </div>
          <label className="ui-row"><input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> Hide the donor’s name on reports</label>
          {(pledgeId || campaignId) && <p className="fin-muted">This gift counts toward {pledgeId ? `pledge #${pledgeId}` : `campaign #${campaignId}`}.</p>}
          <FormError error={submit.error} />
          <div className="ui-form-actions">
            <Button type="submit" variant="primary" loading={submit.loading} disabled={!amount}>Record gift</Button>
            <Button to="/giving/contributions" variant="ghost">Cancel</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
