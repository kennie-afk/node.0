import { useState } from 'react';
import { Button, formatDate, formatMoney, useQuery } from '../../../ui';
import { amountInWords } from '../../../ui/words';
import { getChurchProfile } from '../../../api/churchApi';
import type { Gift } from '../../../api/givingApi';

function donorName(gift: Gift): string {
  if (gift.isAnonymous) return 'Anonymous';
  if (gift.member) return `${gift.member.firstName} ${gift.member.lastName}`;
  return gift.contributorName ?? 'Unnamed';
}

/** The lines both the on-screen receipt and the PDF print, so the two can never disagree. */
function receiptRows(gift: Gift): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ['Received from', donorName(gift)],
    ['Date', formatDate(gift.date)],
    ['Purpose', gift.contributionType],
    ['Fund', gift.fundName ?? '-'],
    ['Payment method', gift.paymentMethod ?? '-'],
    ['Reference', gift.transactionId ?? '-']
  ];
  if (gift.taxDeductible) rows.push(['Tax deductible', 'Yes']);
  return rows;
}

async function downloadPdf(church: string, gift: Gift) {
  // jsPDF is loaded only when someone asks for a PDF, so it costs the console nothing otherwise.
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const w = doc.internal.pageSize.getWidth();
  const top = 20;
  doc.setFont('helvetica', 'bold').setFontSize(16).text(church, w / 2, top, { align: 'center' });
  doc.setFont('helvetica', 'normal').setFontSize(10).text('Official receipt', w / 2, top + 7, { align: 'center' });
  doc.setDrawColor(180).line(14, top + 11, w - 14, top + 11);
  doc.setFont('helvetica', 'bold').setFontSize(11).text(gift.receiptNo ?? `Gift ${gift.id}`, 14, top + 20);
  if (gift.status === 'VOID') doc.setTextColor(176, 0, 0).text('VOID', w - 14, top + 20, { align: 'right' }).setTextColor(0);
  let y = top + 32;
  doc.setFontSize(10);
  for (const [label, value] of receiptRows(gift)) {
    doc.setFont('helvetica', 'normal').setTextColor(110).text(label, 14, y);
    doc.setTextColor(0).setFont('helvetica', 'bold').text(value, 52, y, { maxWidth: w - 66 });
    y += 8;
  }
  doc.setDrawColor(180).line(14, y, w - 14, y);
  y += 10;
  doc.setFontSize(14).text(formatMoney(gift.amount), 14, y);
  y += 7;
  doc.setFont('helvetica', 'italic').setFontSize(9).text(amountInWords(gift.amount), 14, y, { maxWidth: w - 28 });
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(130).text('Thank you for your generosity. Keep this receipt for your records.', w / 2, doc.internal.pageSize.getHeight() - 12, { align: 'center' });
  doc.save(`${gift.receiptNo ?? `gift-${gift.id}`}.pdf`);
}

/** A receipt that prints cleanly and downloads as a PDF. */
export function Receipt({ gift }: { gift: Gift }) {
  const { data: church } = useQuery(() => getChurchProfile(), []);
  const [busy, setBusy] = useState(false);
  const name = church?.name ?? 'Church';
  return (
    <section className="receipt-sheet ui-card" aria-label="Receipt">
      <div className="receipt-head">
        <div className="receipt-church">{name}</div>
        <div className="receipt-kind">Official receipt</div>
      </div>
      <div className="receipt-no">
        <span>{gift.receiptNo ?? `Gift ${gift.id}`}</span>
        {gift.status === 'VOID' && <strong className="receipt-void">VOID</strong>}
      </div>
      <dl className="receipt-rows">
        {receiptRows(gift).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="receipt-total">
        <div className="receipt-amount">{formatMoney(gift.amount)}</div>
        <div className="receipt-words">{amountInWords(gift.amount)}</div>
      </div>
      <div className="receipt-actions no-print">
        <Button variant="secondary" size="sm" onClick={() => window.print()}>Print receipt</Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await downloadPdf(name, gift);
            } finally {
              setBusy(false);
            }
          }}
        >
          Download PDF
        </Button>
      </div>
    </section>
  );
}
