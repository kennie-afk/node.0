import { Printer } from 'lucide-react';
import { Button, Card, useQuery } from '../../ui';
import { getMemberCard } from '../../api/qrApi';
import { QrCode } from './QrCode';

/** The member's own check-in card, for the profile page. Shown only to people who can scan (members:write). */
export function MemberQrCard({ memberId }: { memberId: number }) {
  const card = useQuery(() => getMemberCard(memberId), [memberId]);
  if (!card.data) return null;
  return (
    <Card title="Check-in QR card" actions={<Button variant="ghost" size="sm" icon={<Printer size={12} aria-hidden />} onClick={() => window.print()}>Print</Button>}>
      <div className="ops-qr-card ops-printable">
        <QrCode value={card.data.token} size={132} label={`QR code for ${card.data.name}`} />
        <b>{card.data.name}</b>
        <span className="ops-muted">Scan at the door to mark attendance.</span>
      </div>
    </Card>
  );
}
