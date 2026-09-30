import { useState } from 'react';
import { Button, DataTable, DateInput, EmptyState, Field, InlineConfirm, Input, PageHeader, formatDate, useQuery, useToast, type Column } from '../../ui';
import { addUnavailability, listUnavailability, removeUnavailability, type Unavailability } from '../../api/volunteersApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { Notice } from '../../features/ops/components/FormBanner';
import { MemberPicker } from '../../features/ops/components/pickers';
import { todayISO } from '../../ui';
import { VolunteersTabs } from './VolunteersTabs';

/** Dates a volunteer cannot serve. Managers can look up and set anyone's; everyone else sees their own. */
export default function AvailabilityPage() {
  const { can } = useAuth();
  const manager = can('members:write');
  const [memberId, setMemberId] = useState<number | null>(null);
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const list = useQuery(() => listUnavailability(memberId ?? undefined), [memberId]);
  const notLinked = list.data?.length === 0 && memberId === null && !manager;

  const columns: Array<Column<Unavailability>> = [
    { key: 'from', header: 'From', render: (u) => formatDate(u.fromDate) },
    { key: 'to', header: 'To', render: (u) => formatDate(u.toDate) },
    { key: 'reason', header: 'Reason', render: (u) => u.reason ?? '' },
    { key: 'x', header: '', align: 'right', render: (u) => <InlineConfirm label="Remove" question="Remove these dates?" onConfirm={async () => { try { await removeUnavailability(u.id); toast.success('Removed.'); list.refetch(); } catch (e) { toast.error(normalizeError(e).message); } }} /> }
  ];

  return (
    <OpsPage>
      <PageHeader title="Volunteers" subtitle="Mark the dates someone cannot serve. The roster refuses to schedule them on those days." />
      <VolunteersTabs active="availability" />
      {manager && <div style={{ maxWidth: 360 }}><Field label="Whose availability" hint="Leave empty to see your own.">{(c) => <MemberPicker {...c} value={memberId} onChange={setMemberId} />}</Field></div>}
      <div className="ops-split">
        <DataTable columns={columns} rows={list.data ?? []} rowKey={(u) => u.id} loading={list.loading} error={list.error} onRetry={list.refetch} empty={<EmptyState title="No dates marked" message={notLinked ? 'Your sign-in is not linked to a member record yet, so there is nothing of yours to show. Ask an administrator to link it.' : 'Nothing marked as unavailable.'} />} />
        <form
          className="ui-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await addUnavailability({ memberId: memberId ?? undefined, fromDate: from, toDate: to, reason: reason || null });
              toast.success('Dates saved.');
              setReason('');
              list.refetch();
            } catch (failure) {
              toast.error(normalizeError(failure).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Notice tone="info">{memberId ? 'Adding for the member chosen above.' : 'Adding for yourself.'}</Notice>
          <div className="ui-form-grid">
            <Field label="From">{(c) => <DateInput {...c} value={from} onChange={setFrom} />}</Field>
            <Field label="To">{(c) => <DateInput {...c} value={to} onChange={setTo} />}</Field>
          </div>
          <Field label="Reason">{(c) => <Input {...c} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />}</Field>
          <div><Button type="submit" variant="primary" loading={busy} disabled={!from || !to || to < from}>Mark unavailable</Button></div>
        </form>
      </div>
    </OpsPage>
  );
}
