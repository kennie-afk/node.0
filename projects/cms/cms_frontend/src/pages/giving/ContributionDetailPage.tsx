import { Link, useParams } from 'react-router-dom';
import { Button, Card, ErrorState, formatDate, formatDateTime, PageHeader, PageLoader, StatusPill, useQuery, useToast } from '../../ui';
import { getGift, voidGift } from '../../api/givingApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { KeyValue, Money, PrintButton, ReasonAction } from '../../features/finance/components/common';

export default function ContributionDetailPage() {
  const id = Number(useParams().id);
  const { can } = useAuth();
  const toast = useToast();
  const { data: gift, error, refetch } = useQuery(() => getGift(id), [id]);
  if (error && !gift) return <div className="ui-page"><ErrorState message={error.message} onRetry={refetch} requestId={error.requestId} /></div>;
  if (!gift) return <PageLoader />;
  const donor = gift.isAnonymous ? 'Anonymous' : gift.member ? `${gift.member.firstName} ${gift.member.lastName}` : gift.contributorName ?? 'Unnamed';

  return (
    <div className="ui-page ui-stack">
      <PageHeader
        title={gift.receiptNo ? `Receipt ${gift.receiptNo}` : `Gift #${gift.id}`}
        crumbs={[{ label: 'Gifts', to: '/giving/contributions' }]}
        actions={
          <div className="ui-row no-print">
            <PrintButton />
            {can('giving:write') && gift.status === 'POSTED' && (
              <ReasonAction
                label="Void gift"
                question="Reason for voiding (kept on the record)"
                confirmLabel="Void gift"
                onConfirm={async (reason) => {
                  try {
                    await voidGift(gift.id, reason);
                    toast.success('Gift voided; the ledger entry was reversed');
                    refetch();
                  } catch (failure) {
                    toast.error(normalizeError(failure).message);
                  }
                }}
              />
            )}
          </div>
        }
      />
      <Card title="Gift" actions={<StatusPill status={gift.status} />}>
        <KeyValue
          items={[
            ['Donor', donor],
            ['Amount', <Money key="a" value={gift.amount} strong />],
            ['Date', formatDate(gift.date)],
            ['Type', gift.contributionType],
            ['Fund', gift.fundName ?? '-'],
            ['Method', gift.paymentMethod ?? '-'],
            ['Reference', gift.transactionId ?? '-'],
            ['Source', gift.source],
            ['Tax deductible', gift.taxDeductible ? 'Yes' : 'No'],
            ['Recorded', formatDateTime(gift.createdAt)],
            ['Notes', gift.notes ?? '-'],
            ...(gift.voidReason ? ([['Void reason', gift.voidReason]] as Array<[string, string]>) : [])
          ]}
        />
        <p className="no-print" style={{ marginTop: 12 }}>
          {gift.journalEntryId && <Link to={`/finance/journal/${gift.journalEntryId}`}>View the ledger entry</Link>}
          {gift.batchId && <> · <Link to={`/giving/batches/${gift.batchId}`}>Counting batch</Link></>}
          {gift.pledgeId && <> · <Link to={`/giving/pledges/${gift.pledgeId}`}>Pledge</Link></>}
          {gift.memberId && <> · <Link to={`/giving/statements/${gift.memberId}`}>Giving statement</Link></>}
        </p>
      </Card>
      <Button to="/giving/contributions" variant="ghost" className="no-print">Back to gifts</Button>
    </div>
  );
}
