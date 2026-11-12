import { useCallback, useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { Button, EmptyState, ErrorState, PageHeader, PageLoader } from '../../ui';
import { normalizeError } from '../../api/http';
import { listCards, type MemberCard } from '../../api/qrApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { QrCode } from '../../features/qr/QrCode';

const PAGE = 60;

/** Every member's QR card on a printable sheet, 60 at a time so a large church does not build one huge page. */
export default function QrCardsPage() {
  const [cards, setCards] = useState<MemberCard[]>([]);
  const [more, setMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (after: number) => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listCards(after, PAGE);
      setCards((c) => (after === 0 ? rows : [...c, ...rows]));
      setMore(rows.length === PAGE);
    } catch (failure) {
      setError(normalizeError(failure).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(0); }, [load]);

  if (loading && cards.length === 0) return <PageLoader />;
  if (error && cards.length === 0) return <ErrorState message={error} onRetry={() => void load(0)} />;

  return (
    <OpsPage>
      <div className="ops-noprint">
        <PageHeader title="Member QR cards" subtitle="Print and cut. Each card checks a member in at the door." crumbs={[{ label: 'Scan check-in', to: '/attendance/scan' }, { label: 'QR cards' }]}
          actions={<Button variant="primary" size="sm" icon={<Printer size={12} aria-hidden />} onClick={() => window.print()}>Print this sheet</Button>} />
      </div>
      {cards.length === 0 ? <EmptyState title="No members yet" message="Add members, then print their cards here." /> : (
        <div className="ops-qr-sheet ops-printable">
          {cards.map((c) => (
            <div key={c.memberId} className="ops-qr-card">
              <QrCode value={c.token} size={110} label={`QR code for ${c.name}`} />
              <b>{c.name}</b>
            </div>
          ))}
        </div>
      )}
      {more && <div className="ops-noprint"><Button variant="secondary" size="sm" disabled={loading} onClick={() => void load(cards[cards.length - 1]?.memberId ?? 0)}>{loading ? 'Loading…' : 'Load the next 60'}</Button></div>}
    </OpsPage>
  );
}
